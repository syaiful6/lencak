package app

import (
	"encoding/json"
	"os"
	"strings"

	log "github.com/sirupsen/logrus"
)

type Workspace struct {
	Name               string
	Environment        map[string]string
	Tasks              map[string]*Task
	IsLocked           bool
	Functions          map[string]*Function
	Columns            map[string]map[string][]string
	InheritEnvironment bool
	sync               chan bool
}

type Function struct {
	Name     string   `json:"name"`
	Args     []string `json:"args,omitempty"`
	Command  string   `json:"command"`
	Executor []string `json:"executor,omitempty"`
}

func (ws *Workspace) MarshalJSON() ([]byte, error) {
	return json.Marshal(&struct {
		Name               string                         `json:"name,omitempty"`
		Environment        map[string]string              `json:"environment,omitempty"`
		Tasks              map[string]*Task               `json:"tasks"`
		IsLocked           bool                           `json:"is_locked"`
		Functions          map[string]*Function           `json:"function,omitempty"`
		Columns            map[string]map[string][]string `json:"columns,omitempty"`
		InheritEnvironment bool                           `json:"inherit_environment"`
	}{
		Name:               ws.Name,
		Environment:        ws.Environment,
		Tasks:              ws.Tasks,
		IsLocked:           ws.IsLocked,
		Functions:          ws.Functions,
		InheritEnvironment: ws.InheritEnvironment,
	})
}

// NewWorkspace returns a new workspace
func NewWorkspace(sync chan bool, name string, environment map[string]string, columns map[string]map[string][]string, inheritEnv bool) *Workspace {
	if environment == nil {
		environment = make(map[string]string)
	}
	ws := &Workspace{
		Name:               name,
		Environment:        environment,
		Tasks:              make(map[string]*Task),
		Functions:          make(map[string]*Function),
		Columns:            columns,
		InheritEnvironment: inheritEnv,
		sync:               sync,
	}
	if _, ok := ws.Environment["WORKSPACE"]; !ok {
		ws.Environment["WORKSPACE"] = name
	}
	return ws
}

func configureWorkSpaces(syncChan chan bool, configWorkspaces map[string]*ConfigWorkspace) map[string]*Workspace {
	workspaces := make(map[string]*Workspace)

	for _, ws := range configWorkspaces {
		log.Infof("=> Creating workspace: %s", ws.Name)

		var workspace *Workspace
		if wks, ok := workspaces[ws.Name]; ok {
			log.Warnf("Workspace %s already exists, merging tasks and environment", ws.Name)
			workspace = wks
		} else {
			workspace = NewWorkspace(syncChan, ws.Name, ws.Environment, ws.Columns, ws.InheritEnvironment)
			workspaces[ws.Name] = workspace
		}

		if workspace.InheritEnvironment {
			log.Info("=> Inheriting process environment into workspace")
			for _, k := range os.Environ() {
				p := strings.SplitN(k, "=", 2)
				if strings.TrimSpace(p[0]) == "" {
					log.Warn("Skipping empty environment key")
					continue
				}
				log.Infof("  %s = %s", p[0], p[1])
				// TODO variable subst for current env vars
				if _, ok := workspace.Environment[p[0]]; !ok {
					workspace.Environment[p[0]] = p[1]
				}
			}
		}

		for fn, args := range ws.Functions {
			log.Infof("=> Creating workspace function: %s", fn)
			workspace.Functions[fn] = &Function{
				Name:     fn,
				Args:     args.Args,
				Command:  args.Command,
				Executor: args.Executor,
			}
		}

		for _, t := range ws.Tasks {
			log.Infof("=> Creating task: %s", t.Name)

			if _, ok := workspace.Tasks[t.Name]; ok {
				log.Warnf("Task %s already exists, overwriting", t.Name)
			}

			env := make(map[string]string)
			for k, v := range ws.Environment {
				env[k] = v
			}
			for k, v := range t.Environment {
				env[k] = v
			}

			task := NewTask(t.Name, t.Executor, t.Command, env, t.Service, t.Stdout,
				t.Stderr, t.KillSignal, t.Pwd)
			if task.Service {
				task.Start(syncChan)
			}
			workspace.Tasks[t.Name] = task
		}
	}

	return workspaces
}
