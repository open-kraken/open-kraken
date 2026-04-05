package pty

import (
	"context"
	"errors"
	"io"
	"sync"
)

type FakeLauncher struct {
	Process *FakeProcess
	Err     error
}

func NewFakeLauncher(process *FakeProcess) *FakeLauncher {
	if process == nil {
		process = NewFakeProcess()
	}
	return &FakeLauncher{Process: process}
}

func NewFailingLauncher(err error) *FakeLauncher {
	if err == nil {
		err = errors.New("fake launch failure")
	}
	return &FakeLauncher{Err: err}
}

func (l *FakeLauncher) Launch(_ context.Context, _ LaunchRequest) (Process, error) {
	if l.Err != nil {
		return nil, l.Err
	}
	return l.Process, nil
}

type FakeProcess struct {
	mu         sync.Mutex
	reads      chan []byte
	exitCh     chan Exit
	closed     bool
	writes     []string
	resizeCols uint16
	resizeRows uint16
}

func NewFakeProcess() *FakeProcess {
	return &FakeProcess{
		reads:  make(chan []byte, 32),
		exitCh: make(chan Exit, 1),
	}
}

func (p *FakeProcess) Read(data []byte) (int, error) {
	chunk, ok := <-p.reads
	if !ok {
		return 0, io.EOF
	}
	return copy(data, chunk), nil
}

func (p *FakeProcess) Write(data []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.writes = append(p.writes, string(data))
	return len(data), nil
}

func (p *FakeProcess) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil
	}
	p.closed = true
	close(p.reads)
	return nil
}

func (p *FakeProcess) Resize(cols, rows uint16) error {
	p.mu.Lock()
	p.resizeCols = cols
	p.resizeRows = rows
	p.mu.Unlock()
	return nil
}

func (p *FakeProcess) Wait() <-chan Exit { return p.exitCh }
func (p *FakeProcess) PID() int          { return 1 }

func (p *FakeProcess) PushOutput(data string) {
	p.reads <- []byte(data)
}

func (p *FakeProcess) EmitExit(exit Exit) {
	p.exitCh <- exit
}

func (p *FakeProcess) Writes() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, len(p.writes))
	copy(out, p.writes)
	return out
}

func (p *FakeProcess) ResizeSnapshot() (uint16, uint16) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.resizeCols, p.resizeRows
}
