package app

import (
	"errors"
	"fmt"
	"strconv"

	log "github.com/sirupsen/logrus"
)

type Lencak struct {
	workspaces      map[string]*Workspace
}

func NewLencak(config map[string]*ConfigWorkspace) *Lencak {
	workspaces := configureWorkSpaces(config)

	return &Lencak{
		workspaces:      workspaces,
	}
}

func (lenc *Lencak) Tstart(ws, tn string, service int) ([][]byte, error) {
	log.Infof("get %s, %s and %d", ws, tn, service)
	if _, ok := lenc.workspaces[ws]; ok {
		if task, ok := lenc.workspaces[ws].Tasks[tn]; ok {
			if service != 0 {
				task.serviceMu.Lock()
				task.Service = true
				task.serviceMu.Unlock()
				if task.ActiveTask == nil {
					ex := startExitCode(task)
					return [][]byte{[]byte("TEXIT"), []byte(strconv.Itoa(ex))}, nil
				}
			}
			ex := startExitCode(task)
			return [][]byte{[]byte("TEXIT"), []byte(strconv.Itoa(ex))}, nil
		}
	}
	return nil, errors.New(fmt.Sprintf("%s and %s not exits", ws, tn))
}

func startExitCode(t *Task) int {
	ex := t.Start()
	return <-ex
}
