package app

import (
	"bytes"
	"context"
	"encoding/json"
	"html/template"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	log "github.com/sirupsen/logrus"
	"github.com/syaiful6/lencak/app/resock"
)

const (
	// Time allowed to write message to the client.
	wsWriteWait = 10 * time.Second

	// Time allowed to read the next pong message from the client.
	wsPongWait = 60 * time.Second

	// Send pings to client with this period. Must be less than wsPongWait.
	wsPingPeriod = (wsPongWait * 9) / 10
)

// this channel gets notified when process receives signal. It is global to ease unit testing
var quit = make(chan os.Signal, 1)

type App struct {
	lencak *Lencak
	asset  func(string) ([]byte, error)
	server *http.Server
}

type WSMessage struct {
	Workspace string `json:"workspace"`
	Task string `json:"task"`
	Service bool `json:"service"`
	Command string `json:"command"` // only start/stop supported
}

func NewApp(config map[string]*ConfigWorkspace, asset func(string) ([]byte, error)) (*App, error) {
	lencak := NewLencak(config)
	ws, err := resock.NewServer(lencak)
	if err != nil {
		return nil, err
	}

	router := mux.NewRouter()
	router.StrictSlash(true)

	server := &http.Server{
		Handler: router,
	}

	app := &App{
		lencak: lencak,
		asset:  asset,
		server: server,
	}

	router.Path("/").Methods("GET").HandlerFunc(app.indexHandler())
	router.Path("/js/{file:.*}").Methods("GET").HandlerFunc(app.Static("assets/js/{{file}}"))
	router.Path("/ws").HandlerFunc(ws.Serve)

	go ws.Run()

	return app, nil
}

func (app *App) ListenAndServe(addr string) error {
	// setup channel to get notified on kills signal
	signal.Notify(quit,
		syscall.SIGTERM,
		syscall.SIGINT)

	serveErr := make(chan error)

	l, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	go func() {
		serveErr <- app.server.Serve(l)
	}()

	defer func() {
		log.Info("Clean up tasks processes")
		for _, ws := range app.lencak.workspaces {
			for _, t := range ws.Tasks {
				t.activeMu.Lock()
				if t.ActiveTask != nil && t.ActiveTask.Cmd != nil && t.ActiveTask.Cmd.Process != nil {
					t.ActiveTask.Stop(t.KillSignal)
				}
				t.activeMu.Unlock()
			}
		}
	}()

	select {
	case err = <-serveErr:
		return err

	case <-quit:
		log.Info("shutdown server")
		c, cancel := context.WithTimeout(context.Background(), time.Second*20)
		defer cancel()
		return app.server.Shutdown(c)
	}
}

func (app *App) Static(pattern string) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		vars := mux.Vars(req)
		fi := vars["file"]
		fp := strings.TrimSuffix(pattern, "{{file}}") + fi

		if b, err := app.asset(fp); err == nil {
			ext := filepath.Ext(fp)

			w.Header().Set("Content-Type", mime.TypeByExtension(ext))
			w.WriteHeader(200)
			w.Write(b)
			return
		}
		log.Printf("[UI] File not found: %s", fp)
		w.WriteHeader(404)
	}
}

func (app *App) indexHandler() func(http.ResponseWriter, *http.Request) {
	tmpl := template.New("index.html")

	asset, err := app.asset("assets/templates/index.html")
	if err != nil {
		log.Fatalf("[UI] Error loading index.html: %s", err)
	}

	tmpl, err = tmpl.Parse(string(asset))

	return func(w http.ResponseWriter, req *http.Request) {
		workspaces, err := json.Marshal(app.lencak.workspaces)
		if err != nil {
			log.Printf("error marshaling workspace: %s", err)
			w.WriteHeader(500)
			return
		}
		data := map[string]interface{}{
			"Title":      "Websyd",
			"Page":       "Workspaces",
			"WorkSpaces": workspaces,
		}

		b := new(bytes.Buffer)
		err = tmpl.Execute(b, data)

		if err != nil {
			log.Printf("[UI] Error executing template: %s", err)
			w.WriteHeader(500)
			return
		}

		w.WriteHeader(200)
		w.Write(b.Bytes())
	}
}
