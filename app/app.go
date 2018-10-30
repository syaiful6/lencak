package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

func NewApp(config *ConfigWorkspaces, asset func(string) ([]byte, error)) *App {
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

	// api
	apiRouter := router.PathPrefix("/api").Subrouter()
	apiRouter.Use(apiHeaderMiddleware)
	apiRouter.Path("/").Methods("GET").HandlerFunc(app.apiIndexHandler())
	apiRouter.Path("/workspaces").Methods("GET").HandlerFunc(app.listWorkspacesHandler())
	apiRouter.Path("/workspaces/{workspace}").Methods("GET").HandlerFunc(app.listTaskHandler())
	apiRouter.Path("/workspaces/{workspace}/task/{task}/start").
		Methods("POST").
		HandlerFunc(app.startTaskHandler())
	apiRouter.Path("/workspaces/{workspace}/task/{task}/stop").
		Methods("POST").
		HandlerFunc(app.stopTaskHandler())
	apiRouter.Path("/workspaces/{workspace}/task/{task}").
		Methods("GET").
		HandlerFunc(app.taskHistoryHandler())

	return app
}

func countTask(workspaces map[string]*ConfigWorkspace) int {
	count := 0
	for _, workspace := range workspaces {
		count += len(workspace.Tasks)
	}

	return count
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
			app.lencak.Lock()
			msg, err := json.Marshal(app.lencak.workspaces)
			app.lencak.Unlock()
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
					app.lencak.Lock()
					msg, err := json.Marshal(app.lencak.workspaces)
					app.lencak.Unlock()
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
				if t.ActiveTask != nil && t.ActiveTask.Cmd != nil && t.ActiveTask.Cmd.Process != nil {
					t.ActiveTask.Cmd.Process.Kill()
				}
			}
		}
	}()

	select {
	case err = <-serveErr:
		return err

	case <-quit:
		log.Info("shutdown server")
		c, cancel := context.WithTimeout(context.Background(), time.Second*30)
		defer cancel()
		return app.server.Shutdown(c)
	}
}

func apiHeaderMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		next.ServeHTTP(w, r)
	})
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

func (app *App) apiIndexHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		enc := json.NewEncoder(w)
		info := &struct {
			Name    string `json:"name"`
			Version string `json:"string"`
		}{
			Name:    "Lencak",
			Version: "v0.0.1",
		}
		if err := enc.Encode(info); err != nil {
			renderError(w, 500, err)
		}
	}
}

func (app *App) listWorkspacesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {

		workspaces, err := json.Marshal(app.lencak.workspaces)
		if err != nil {
			log.Printf("error marshaling workspace: %s", err)
			renderError(w, 500, err)
			return
		}

		w.WriteHeader(200)
		w.Write(workspaces)
	}
}

func (app *App) listTaskHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		var err error
		vars := mux.Vars(req)
		id := vars["workspace"]
		enc := json.NewEncoder(w)
		if workspace, ok := app.lencak.workspaces[id]; ok {
			if err = enc.Encode(&struct {
				Tasks map[string]*Task `json:"tasks"`
			}{
				Tasks: workspace.Tasks,
			}); err != nil {
				renderError(w, 500, err)
				return
			}
			return
		}

		renderError(w, 404, errors.New(fmt.Sprintf("Workspace %s didn't exists", id)))
	}
}

func (app *App) taskHistoryHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		var err error
		vars := mux.Vars(req)
		enc := json.NewEncoder(w)
		id, tid := vars["workspace"], vars["task"]
		if workspace, ok := app.lencak.workspaces[id]; ok {
			if task, ok := app.lencak.workspaces[id].Tasks[tid]; ok {
				if err = enc.Encode(&struct {
					Workspace *Workspace `json:"workspace"`
					Task      *Task      `json:"task"`
				}{
					Workspace: &Workspace{
						Name:               workspace.Name,
						Environment:        workspace.Environment,
						Functions:          workspace.Functions,
						IsLocked:           workspace.IsLocked,
						Columns:            workspace.Columns,
						InheritEnvironment: workspace.InheritEnvironment,
					},
					Task: task,
				}); err != nil {
					renderError(w, 500, err)
					return
				}
				return
			}

			renderError(w, 404, errors.New(fmt.Sprintf("Workspace %s didn't have task %s", id, tid)))
			return
		}

		renderError(w, 404, errors.New(fmt.Sprintf("Workspace %s didn't exists", id)))
	}
}

func (app *App) startTaskHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		defer req.Body.Close()

		vars := mux.Vars(req)
		id, tid := vars["workspace"], vars["task"]
		service := req.FormValue("service")

		ok := app.lencak.StartTask(id, tid, service == "on")
		if ok {
			fmt.Fprint(w, `{"ok": true}`)
			return
		}

		renderError(w, 404, errors.New(fmt.Sprintf("Workspace %s or task %s didn't exists", id, tid)))
	}
}

func (app *App) stopTaskHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		defer req.Body.Close()

		vars := mux.Vars(req)
		id, tid := vars["workspace"], vars["task"]
		service := req.FormValue("service")

		ok := app.lencak.StopTask(id, tid, service == "off")
		if ok {
			fmt.Fprint(w, `{"ok": true}`)
			return
		}

		renderError(w, 404, errors.New(fmt.Sprintf("Workspace %s or task %s didn't exists", id, tid)))
	}
}

func renderError(w http.ResponseWriter, code int, err error) {
	w.WriteHeader(code)
	errorJson, marshalErr := json.Marshal(&struct {
		Ok  bool   `json:"ok"`
		Err string `json:"error"`
	}{
		Ok:  false,
		Err: err.Error(),
	})
	if marshalErr != nil {
		fmt.Fprint(w, `{"ok": false, "err": "unknown"}`)
		return
	}
	w.Write(errorJson)
}
