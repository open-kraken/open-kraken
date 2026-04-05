package pty

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	ptylib "github.com/creack/pty"
)

type LaunchRequest struct {
	Command string
	CWD     string
	Cols    uint16
	Rows    uint16
}

type Exit struct {
	Code   *int32 `json:"code,omitempty"`
	Signal string `json:"signal,omitempty"`
}

type Process interface {
	io.ReadWriteCloser
	Resize(cols, rows uint16) error
	Wait() <-chan Exit
	PID() int
}

type Launcher interface {
	Launch(context.Context, LaunchRequest) (Process, error)
}

type LocalLauncher struct{}

func NewLocalLauncher() *LocalLauncher {
	return &LocalLauncher{}
}

func (l *LocalLauncher) Launch(ctx context.Context, req LaunchRequest) (Process, error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}

	var cmd *exec.Cmd
	if strings.TrimSpace(req.Command) == "" {
		cmd = exec.CommandContext(ctx, shell, "-l")
	} else {
		cmd = exec.CommandContext(ctx, shell, "-lc", req.Command)
	}
	if req.CWD != "" {
		cmd.Dir = req.CWD
	}

	ptmx, err := ptylib.StartWithSize(cmd, &ptylib.Winsize{Cols: req.Cols, Rows: req.Rows})
	if err != nil {
		return nil, fmt.Errorf("start pty: %w", err)
	}

	proc := &localProcess{
		file:   ptmx,
		cmd:    cmd,
		exitCh: make(chan Exit, 1),
	}
	go proc.wait()
	return proc, nil
}

type localProcess struct {
	file   *os.File
	cmd    *exec.Cmd
	exitCh chan Exit
	once   sync.Once
}

func (p *localProcess) Read(data []byte) (int, error)  { return p.file.Read(data) }
func (p *localProcess) Write(data []byte) (int, error) { return p.file.Write(data) }
func (p *localProcess) Wait() <-chan Exit              { return p.exitCh }

func (p *localProcess) Close() error {
	var err error
	p.once.Do(func() {
		err = p.file.Close()
		if p.cmd.Process != nil {
			_ = p.cmd.Process.Kill()
		}
	})
	return err
}

func (p *localProcess) Resize(cols, rows uint16) error {
	return ptylib.Setsize(p.file, &ptylib.Winsize{Cols: cols, Rows: rows})
}

func (p *localProcess) PID() int {
	if p.cmd.Process == nil {
		return 0
	}
	return p.cmd.Process.Pid
}

func (p *localProcess) wait() {
	err := p.cmd.Wait()
	var exit Exit
	if err == nil {
		code := int32(0)
		exit.Code = &code
		p.exitCh <- exit
		return
	}
	if exitErr, ok := err.(*exec.ExitError); ok {
		code := int32(exitErr.ExitCode())
		exit.Code = &code
		p.exitCh <- exit
		return
	}
	exit.Signal = err.Error()
	p.exitCh <- exit
}
