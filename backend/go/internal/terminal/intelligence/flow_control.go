package intelligence

import "sync/atomic"

// FlowControl tracks unacknowledged bytes for PTY backpressure management.
// When unacked bytes exceed the high watermark, reads should be paused.
// When they drop below the low watermark, reads should resume.
type FlowControl struct {
	unackedBytes atomic.Int64
}

// NewFlowControl creates a FlowControl instance.
func NewFlowControl() *FlowControl {
	return &FlowControl{}
}

// Add records bytes sent to the frontend.
func (fc *FlowControl) Add(n int) {
	fc.unackedBytes.Add(int64(n))
}

// Ack records bytes acknowledged by the frontend.
func (fc *FlowControl) Ack(n int) {
	fc.unackedBytes.Add(-int64(n))
	if fc.unackedBytes.Load() < 0 {
		fc.unackedBytes.Store(0)
	}
}

// UnackedBytes returns the current unacked byte count.
func (fc *FlowControl) UnackedBytes() int64 {
	return fc.unackedBytes.Load()
}

// ShouldPause returns true when unacked bytes exceed the high watermark.
func (fc *FlowControl) ShouldPause() bool {
	return fc.unackedBytes.Load() >= FlowControlHighWatermark
}

// ShouldResume returns true when unacked bytes drop below the low watermark.
func (fc *FlowControl) ShouldResume() bool {
	return fc.unackedBytes.Load() <= FlowControlLowWatermark
}
