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
	sync               chan string
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

// GetColumn of workspace
func (ws *Workspace) GetColumn(global *Workspace, task *Task, name string) string {
	col := ws.Columns[name]
	var fn []string
	var nm string
	for n, args := range col {
		nm = n
		fn = args
		break
	}
	return ws.ExecFunction(global, task, nm, fn...)
}

func (ws *Workspace) ExecFunction(global *Workspace, task *Task, name string, args ...string) string {
	log.Infof("Executing function %s: %s", name, args)

	var fn *Function
	if f, ok := ws.Functions[name]; ok {
		fn = f
	} else if f, ok := global.Functions[name]; ok {
		fn = f
	} else {
		log.Warnf("Function not found: %s", name)
		return ""
	}

	argmap := make(map[string]string)
	for i, arg := range fn.Args {
		argmap[arg] = args[i]
	}

	for k, v := range argmap {
		log.Infof("argmap: %s => %s", k, v)
		for t, m := range task.Metadata {
			log.Infof("meta: %s => %s", t, m)
			v = strings.Replace(v, "$"+t, m, -1)
		}
		argmap[k] = v
	}

	c := fn.Command
	for k, v := range argmap {
		log.Infof("ARG: %s => %s", k, v)
		c = strings.Replace(c, k, v, -1)
	}

	var funcEnvironment map[string]string
	if ws.InheritEnvironment {
		funcEnvironment = ws.Environment
	} else if global.InheritEnvironment {
		funcEnvironment = global.Environment
	} else {
		funcEnvironment = make(map[string]string)
	}

	tsk := NewTask("Function$"+name, fn.Executor, c, funcEnvironment, false, "", "", make(map[string]string), "")
	ch := tsk.Start(ws.sync)
	<-ch
	return tsk.TaskRuns[0].StdoutBuf.String()
}

// ActiveTasks returns the number of active tasks in a workspace
func (ws *Workspace) ActiveTasks() int {
	a := 0
	for _, t := range ws.Tasks {
		if t.ActiveTask != nil {
			a++
		}
	}
	return a
}

// InactiveTasks returns the number of inactive tasks in a workspace
func (ws *Workspace) InactiveTasks() int {
	return ws.TotalTasks() - ws.ActiveTasks()
}

// TotalTasks returns the total number of tasks in a workspace
func (ws *Workspace) TotalTasks() int {
	return len(ws.Tasks)
}

// PercentActive returns the percentage of tasks active in a workspace
func (ws *Workspace) PercentActive() int {
	return int(float64(ws.ActiveTasks()) / float64(ws.TotalTasks()) * float64(100))
}

// PercentInactive returns the percentage of tasks inactive in a workspace
func (ws *Workspace) PercentInactive() int {
	return 100 - ws.PercentActive()
}

// NewWorkspace returns a new workspace
func NewWorkspace(sync chan string, name string, environment map[string]string, columns map[string]map[string][]string, inheritEnv bool) *Workspace {
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

func configureGlobalWorkSpace(sync chan string, workspace *ConfigWorkspace) *Workspace {
	globalWorkspace := NewWorkspace(sync,
		workspace.Name,
		workspace.Environment,
		make(map[string]map[string][]string),
		workspace.InheritEnvironment)

	for fn, args := range workspace.Functions {
		globalWorkspace.Functions[fn] = &Function{
			Name:     fn,
			Args:     args.Args,
			Command:  args.Command,
			Executor: args.Executor,
		}
	}

	if globalWorkspace.InheritEnvironment {
		log.Info("=> Inheriting process environment into global workspace")
		for _, k := range os.Environ() {
			p := strings.SplitN(k, "=", 2)
			if strings.TrimSpace(p[0]) == "" {
				log.Warn("Skipping empty environment key")
				continue
			}
			log.Infof("  %s = %s", p[0], p[1])
			// TODO variable subst for current env vars
			if _, ok := globalWorkspace.Environment[p[0]]; !ok {
				globalWorkspace.Environment[p[0]] = p[1]
			}
		}
	}

	return globalWorkspace
}

func configureWorkSpaces(syncChan chan string, globalWorkspace *Workspace, configWorkspaces map[string]*ConfigWorkspace) map[string]*Workspace {
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

		if workspace.InheritEnvironment && !globalWorkspace.InheritEnvironment {
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
			for k, v := range globalWorkspace.Environment {
				env[k] = v
			}
			for k, v := range ws.Environment {
				env[k] = v
			}
			for k, v := range t.Environment {
				env[k] = v
			}

			task := NewTask(t.Name, t.Executor, t.Command, env, t.Service, t.Stdout,
				t.Stderr, t.Metadata, t.Pwd)
			if task.Service {
				task.Start(syncChan)
			}
			workspace.Tasks[t.Name] = task
		}
	}

	return workspaces
}
