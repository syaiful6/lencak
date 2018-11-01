package app

import (
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"syscall"
	"time"

	log "github.com/sirupsen/logrus"
)

type TaskRun struct {
	Id          int
	Cmd         *exec.Cmd
	Error       error
	Started     time.Time
	Stopped     time.Time
	Events      []*Event
	Command     string
	Stdout      string
	Stderr      string
	StdoutBuf   LogWriter
	StderrBuf   LogWriter
	Environment map[string]string
	Executor    []string
	WaitStatus  syscall.WaitStatus
	Pwd         string
}

// Event represents an event
type Event struct {
	Time    time.Time `json:"time"`
	Message string    `json:"message"`
}

func (tr *TaskRun) MarshalJSON() ([]byte, error) {
	var err = ""
	if tr.Error != nil {
		err = tr.Error.Error()
	}
	return json.Marshal(&struct {
		Id          int               `json:"id"`
		Pid         int               `json:"pid,omitempty"`
		Error       string            `json:"error"`
		Started     time.Time         `json:"started"`
		Stopped     time.Time         `json:"stopped"`
		Events      []*Event          `jaon:"events"`
		Command     string            `json:"command"`
		Stdout      string            `json:"stdout,omitempty"`
		Stderr      string            `json:"stderr,omitempty"`
		StdoutBuf   string            `json:"stdoutbuf"`
		StderrBuf   string            `json:"stderrbuf"`
		Environment map[string]string `json:"environment"`
		Executor    []string          `json:"executor"`
		Pwd         string            `json:"pwd"`
	}{
		Id:          tr.Id,
		Pid:         tr.Cmd.Process.Pid,
		Error:       err,
		Events:      tr.Events,
		Started:     tr.Started,
		Stopped:     tr.Stopped,
		Command:     tr.Command,
		Stdout:      tr.Stdout,
		Stderr:      tr.Stderr,
		StdoutBuf:   tr.StdoutBuf.String(),
		StderrBuf:   tr.StderrBuf.String(),
		Environment: tr.Environment,
		Executor:    tr.Executor,
		Pwd:         tr.Pwd,
	})
}

func (tr *TaskRun) String() string {
	return fmt.Sprintf("Pid %d", tr.Cmd.Process.Pid)
}

func (tr *TaskRun) Start(exitCh chan int) {
	tr.Started = time.Now()

	stdout, err := tr.Cmd.StdoutPipe()
	if err != nil {
		tr.Error = err
		exitCh <- 1
		return
	}
	stderr, err := tr.Cmd.StderrPipe()
	if err != nil {
		tr.Error = err
		exitCh <- 1
		return
	}

	if len(tr.Stdout) > 0 {
		wr, err := NewFileLogWriter(tr.Stdout)
		if err != nil {
			log.Errorf("Unable to open file %s: %s", tr.Stdout, err.Error())
			tr.StdoutBuf = NewInMemoryLogWriter()
		} else {
			tr.StdoutBuf = wr
		}
	} else {
		tr.StdoutBuf = NewInMemoryLogWriter()
	}
	if len(tr.Stderr) > 0 {
		wr, err := NewFileLogWriter(tr.Stderr)
		if err != nil {
			log.Errorf("Unable to open file %s: %s", tr.Stderr, err.Error())
			tr.StderrBuf = NewInMemoryLogWriter()
		} else {
			tr.StderrBuf = wr
		}
	} else {
		tr.StderrBuf = NewInMemoryLogWriter()
	}

	if len(tr.Pwd) > 0 {
		log.Infof("Setting pwd: %s", tr.Pwd)
		tr.Cmd.Dir = tr.Pwd
	}

	for k, v := range tr.Environment {
		log.Infof("Adding env var %s = %s", k, v)
		tr.Cmd.Env = append(tr.Cmd.Env, k+"="+v)
	}

	err = tr.Cmd.Start()
	if tr.Cmd.Process != nil {
		ev := &Event{time.Now(), fmt.Sprintf("Process %d started: %s", tr.Cmd.Process.Pid, tr.Command)}
		log.Info(ev.Message)
		tr.Events = append(tr.Events, ev)
	}
	if err != nil {
		tr.Error = err
		log.Error(err.Error())
		tr.StdoutBuf.Close()
		tr.StderrBuf.Close()
		exitCh <- 1
		return
	}
	go func() {
		go io.Copy(tr.StdoutBuf, stdout)
		go io.Copy(tr.StderrBuf, stderr)

		tr.Cmd.Wait()

		tr.StdoutBuf.Close()
		tr.StderrBuf.Close()

		ps := tr.Cmd.ProcessState
		sy := ps.Sys().(syscall.WaitStatus)

		exitCode := sy.ExitStatus()
		if exitCode == 0 {
			log.Infof("STDOUT: %s", tr.StdoutBuf.String())
			log.Infof("STDERR: %s", tr.StderrBuf.String())
		} else {
			log.Errorf("STDOUT: %s", tr.StdoutBuf.String())
			log.Errorf("STDERR: %s", tr.StderrBuf.String())
		}

		ev := &Event{time.Now(), fmt.Sprintf("Process %d exited with status %d", ps.Pid(), exitCode)}
		log.Info(ev.Message)
		tr.Events = append(tr.Events, ev)
		log.Info(ps.String())

		tr.Stopped = time.Now()
		exitCh <- exitCode
	}()
}

func (tr *TaskRun) Stop(kill KillSignal) {
	if tr.Cmd == nil || tr.Cmd.Process == nil {
		return
	}
	kl := string(kill)

	switch kl {
	case "sigint":
		tr.Cmd.Process.Signal(syscall.SIGINT)
	case "sigterm":
		tr.Cmd.Process.Signal(syscall.SIGTERM)
	default:
		tr.Cmd.Process.Kill()
	}
}
