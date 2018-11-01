package app

import (
	"errors"
	"fmt"

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
				log.Infof("processed %s.%sas service", ws, tn)
				task.serviceMu.Lock()
				task.Service = true
				task.serviceMu.Unlock()
				task.activeMu.Lock()
				active := task.ActiveTask
				task.activeMu.Unlock()
				if active == nil {
					task.Start()
				}
				return [][]byte{[]byte("STARTED"), []byte(ws), []byte(tn),}, nil
			}
			log.Infof("processed %s.%sas normal task", ws, tn)
			task.Start()
			return [][]byte{[]byte("STARTED"), []byte(ws), []byte(tn),}, nil
		}
	}
	return nil, errors.New(fmt.Sprintf("%s and %s not exits", ws, tn))
}

func (lenc *Lencak) Tstop(ws, tn string, service int) ([][]byte, error) {
	log.Infof("get %s, %s and %d", ws, tn, service)
	if _, ok := lenc.workspaces[ws]; ok {
		if task, ok := lenc.workspaces[ws].Tasks[tn]; ok {
			task.serviceMu.Lock()
			defer task.serviceMu.Unlock()
			if service != 0 {
				task.Service = false
			}
			task.Stop()
			return [][]byte{[]byte("EXITED"), []byte(ws), []byte(tn),}, nil
		}
	}
	return nil, errors.New(fmt.Sprintf("%s and %s didn't exits", ws, tn))
}
