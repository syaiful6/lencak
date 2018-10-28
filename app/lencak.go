package app

type Lencak struct {
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
			task.Service = true
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
		if task.Service && disableService {
			task.Service = false
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
