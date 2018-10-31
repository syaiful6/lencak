package app

import (
	"bytes"
	"context"
	"encoding/json"
	"html/template"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
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

func NewApp(config map[string]*ConfigWorkspace, asset func(string) ([]byte, error)) *App {
	lencak := NewLencak(config)

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
	router.Path("/ws").HandlerFunc(app.lencakWebsocket())

	return app
}

func upgradeCheckOrigin(r *http.Request) bool {
	origin := r.Header["Origin"]
	if len(origin) == 0 {
		return true
	}
	u, err := url.Parse(origin[0])
	if err != nil {
		return false
	}
	uh, _, err1 := net.SplitHostPort(u.Host)
	oh, _, err2 := net.SplitHostPort(r.Host)
	if err1 != nil || err2 != nil {
		return false
	}
	return equalASCIIFold(uh, oh)
}

func (app *App) lencakWebsocket() http.HandlerFunc {
	// uprader
	var upgrader = websocket.Upgrader{CheckOrigin: upgradeCheckOrigin,}

	return func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Errorf("websocket upgrade fail with: %v:", err)
			return
		}
		pingTicker := time.NewTicker(wsPingPeriod)

		defer func() {
			pingTicker.Stop()
			ws.Close()
		}()

		go func() {
			// write our workspace when they connected
			msg, err := json.Marshal(app.lencak.workspaces)
			if err != nil {
				log.Errorf("websocket error marshalling workspace %s", err.Error())
				return
			}
			ws.SetWriteDeadline(time.Now().Add(wsWriteWait))
			err = ws.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				return
			}
			for {
				select {
				case <-app.lencak.sync:
					msg, err := json.Marshal(app.lencak.workspaces)
					if err != nil {
						log.Errorf("websocket error marshalling workspace %s", err.Error())
						return
					}
					err = ws.WriteMessage(websocket.TextMessage, msg)
					if err != nil {
						return
					}

				case <-pingTicker.C:
					ws.SetWriteDeadline(time.Now().Add(wsWriteWait))
					if err = ws.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
						return
					}
				}
			}
		}()

		// reader
		ws.SetReadLimit(512)
		ws.SetReadDeadline(time.Now().Add(wsPongWait))
		ws.SetPongHandler(func(string) error {
			ws.SetReadDeadline(time.Now().Add(wsPongWait)); return nil
		})
		for {
			mtype, message, err := ws.ReadMessage()
			if err != nil {
				break
			}
			if mtype == websocket.TextMessage {
				// unmarshal
				var wsMsg WSMessage
				if err = json.Unmarshal(message, &wsMsg); err != nil {
					break
				}
				log.Infof("websocket receive message w: %s, t: %s, c: %s",
					wsMsg.Workspace, wsMsg.Task, wsMsg.Command)
				if wsMsg.Workspace != "" && wsMsg.Task != "" {
					switch wsMsg.Command {
					case "start":
						app.lencak.StartTask(wsMsg.Workspace, wsMsg.Task, wsMsg.Service)
					case "stop":
						app.lencak.StopTask(wsMsg.Workspace, wsMsg.Task, wsMsg.Service)
					default:
						log.Infof("receive message from websocket %s", string(message))
					}
				}
			}
		}
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
