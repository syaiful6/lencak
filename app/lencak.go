package app

import (
	"sync"

	log "github.com/sirupsen/logrus"
)

type Lencak struct {
	sync.RWMutex
	config          *ConfigWorkspaces
	globalWorkspace *Workspace
	workspaces      map[string]*Workspace
	sync            chan string
}

func NewLencak(config *ConfigWorkspaces) *Lencak {
	sync := make(chan string)
	globalWorkspace := configureGlobalWorkSpace(sync, config.Global)
	workspaces := configureWorkSpaces(sync, globalWorkspace, config.Workspaces)

	return &Lencak{
		config:          config,
		globalWorkspace: globalWorkspace,
		workspaces:      workspaces,
		sync:            sync,
	}
}

// Start task taskName in workspaces workSpaceName, return true if task sucessfully
// started
func (lenc *Lencak) StartTask(workSpaceName, taskName string, asService bool) bool {
	return lenc.WithWorkspaceTask(workSpaceName, taskName, func(task *Task) {
		if asService {
			task.serviceMu.Lock()
			task.Service = true
			task.serviceMu.Unlock()
			if task.ActiveTask == nil {
				task.Start(lenc.sync)
			}
		} else {
			task.Start(lenc.sync)
		}
	})
}

// Stop task
func (lenc *Lencak) StopTask(workSpaceName, taskName string, disableService bool) bool {
	return lenc.WithWorkspaceTask(workSpaceName, taskName, func(task *Task) {
		task.serviceMu.Lock()
		defer task.serviceMu.Unlock()
		if task.Service && disableService {
			task.Service = false
			log.Infof("disabling service %s in workspace %s", taskName, workSpaceName)
		}
		task.Stop()
	})
}

func (lenc *Lencak) WithWorkspaceTask(workSpaceName, taskName string, f func(*Task)) bool {
	lenc.Lock()
	defer lenc.Unlock()
	if _, ok := lenc.workspaces[workSpaceName]; ok {
		if task, ok := lenc.workspaces[workSpaceName].Tasks[taskName]; ok {
			f(task)
			return true
		}
	}
	return false
}
