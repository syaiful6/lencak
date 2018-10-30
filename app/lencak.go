package app

import (
	log "github.com/sirupsen/logrus"
)

type Lencak struct {
	workspaces      map[string]*Workspace
	sync            chan bool
}

func NewLencak(config map[string]*ConfigWorkspace) *Lencak {
	sync := make(chan bool, 256)
	workspaces := configureWorkSpaces(sync, config)

	return &Lencak{
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
	if _, ok := lenc.workspaces[workSpaceName]; ok {
		if task, ok := lenc.workspaces[workSpaceName].Tasks[taskName]; ok {
			f(task)
			return true
		}
	}
	return false
}
