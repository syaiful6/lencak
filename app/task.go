package app

import (
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
)

type Task struct {
	ID          int
	Name        string
	Command     string
	KillSignal  KillSignal
	Executor    []string
	Environment map[string]string
	Stdout      string
	Stderr      string
	Pwd         string

	activeMu sync.Mutex
	ActiveTask *TaskRun
	TaskRuns   []*TaskRun

	serviceMu sync.Mutex
	Service bool
}

func (t *Task) MarshalJSON() ([]byte, error) {
	return json.Marshal(&struct {
		ID          int               `json:"id"`
		Name        string            `json:"name"`
		Command     string            `json:"command"`
		Executor    []string          `json:"executor"`
		Environment map[string]string `json:"environment"`
		Stdout      string            `json:"stdout,omitempty"`
		Stderr      string            `json:"stderr,omitempty"`
		Pwd         string            `json:"pwd"`
		Service     bool              `json:"service"`
		Status      string            `json:"status"`
	}{
		ID:          t.ID,
		Name:        t.Name,
		Command:     t.Command,
		Executor:    t.Executor,
		Environment: t.Environment,
		Stdout:      t.Stdout,
		Stderr:      t.Stderr,
		Pwd:         t.Pwd,
		Service:     t.Service,
		Status:      t.Status(),
	})
}

func NewTask(name string, executor []string, command string, environment map[string]string, service bool, stdout string, stderr string, killSignal  KillSignal, pwd string) *Task {
	environment = AddDefaultVars(environment)

	if _, ok := environment["TASK"]; !ok {
		environment["TASK"] = name
	}

	stdout = ReplaceVars(stdout, environment)
	stderr = ReplaceVars(stderr, environment)

	task := &Task{
		Name:        name,
		Command:     command,
		KillSignal:  killSignal,
		Environment: environment,
		TaskRuns:    make([]*TaskRun, 0),
		Service:     service,
		Executor:    executor,
		Stdout:      stdout,
		Stderr:      stderr,
		Pwd:         pwd,
	}

	return task
}

func (t *Task) Start(sync chan bool) chan int {
	c1 := make(chan int, 1)
	if t.ActiveTask == nil {
		t.activeMu.Lock()
		t.ActiveTask = t.NewTaskRun()
		t.activeMu.Unlock()
		c := make(chan int)
		select {
		case sync <- true:
			log.Infof("success sending event task started for %s", t.Name)
		default:
			log.Infof("failed sending event task started for %s", t.Name)
		}

		t.ActiveTask.Start(c)

		go func() {
			ex := <-c
			c1 <- ex
			select {
			case sync <- true:
				log.Infof("success sending event task stopped for %s", t.Name)
			default:
				log.Infof("failed sending event task stopped for %s", t.Name)
			}
			t.activeMu.Lock()
			t.ActiveTask = nil
			t.activeMu.Unlock()

			t.serviceMu.Lock()
			service := t.Service
			t.serviceMu.Unlock()

			if service {
				time.Sleep(time.Second * 1)
				t.Start(sync)
				return
			}
		}()
	}
	return c1
}

// Stop stops a task
func (t *Task) Stop() {
	t.activeMu.Lock()
	defer t.activeMu.Unlock()
	if t.ActiveTask != nil {
		t.ActiveTask.Stop(t.KillSignal)
		t.ActiveTask = nil
	}
}

func (t *Task) NewTaskRun() *TaskRun {
	run := len(t.TaskRuns)

	c := t.Command
	c = ReplaceVars(c, t.Environment)

	var cmd *exec.Cmd
	if len(t.Executor) > 0 {
		cmd = exec.Command(t.Executor[0], append(t.Executor[1:], c)...)
	} else {
		bits := strings.Split(c, " ")
		cmd = exec.Command(bits[0], bits[1:]...)
	}

	vars := map[string]string{
		"TASK": strconv.Itoa(t.ID),
		"RUN":  strconv.Itoa(run),
	}
	if len(t.Pwd) > 0 {
		vars["PWD"] = t.Pwd
	}

	stdout := ReplaceVars(t.Stdout, vars)
	stderr := ReplaceVars(t.Stderr, vars)

	tr := &TaskRun{
		Id:          run,
		Events:      make([]*Event, 0),
		Cmd:         cmd,
		Command:     t.Command,
		Environment: make(map[string]string),
		Stdout:      stdout,
		Stderr:      stderr,
		Pwd:         t.Pwd,
	}

	for k, v := range t.Environment {
		tr.Environment[k] = v
	}

	t.TaskRuns = append(t.TaskRuns, tr)
	return tr
}

// Status returns a string representation of the current task status
func (t *Task) Status() string {
	t.activeMu.Lock()
	defer t.activeMu.Unlock()
	if t.ActiveTask != nil {
		return "Running"
	}
	return "Stopped"
}
