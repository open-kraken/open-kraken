package ael

import "testing"

func TestRunFSM(t *testing.T) {
	t.Run("valid transitions", func(t *testing.T) {
		cases := [][2]RunState{
			{RunPending, RunRunning},
			{RunPending, RunCancelled},
			{RunRunning, RunSucceeded},
			{RunRunning, RunFailed},
			{RunRunning, RunCancelled},
		}
		for _, c := range cases {
			if err := ValidateRunTransition(c[0], c[1]); err != nil {
				t.Errorf("want nil, got %v for %s → %s", err, c[0], c[1])
			}
		}
	})

	t.Run("terminal states are absorbing", func(t *testing.T) {
		terminals := []RunState{RunSucceeded, RunFailed, RunCancelled}
		lives := []RunState{RunPending, RunRunning, RunSucceeded, RunFailed, RunCancelled}
		for _, from := range terminals {
			for _, to := range lives {
				if from == to {
					continue // idempotent no-op is allowed
				}
				if err := ValidateRunTransition(from, to); err == nil {
					t.Errorf("want error for terminal %s → %s, got nil", from, to)
				}
			}
		}
	})

	t.Run("idempotent no-op allowed", func(t *testing.T) {
		for _, s := range []RunState{RunPending, RunRunning, RunSucceeded, RunFailed, RunCancelled} {
			if err := ValidateRunTransition(s, s); err != nil {
				t.Errorf("want nil for idempotent %s → %s, got %v", s, s, err)
			}
		}
	})
}

func TestStepFSM(t *testing.T) {
	t.Run("lease happy path", func(t *testing.T) {
		path := []StepState{StepPending, StepLeased, StepRunning, StepSucceeded}
		for i := 0; i < len(path)-1; i++ {
			if err := ValidateStepTransition(path[i], path[i+1]); err != nil {
				t.Errorf("want nil for %s → %s, got %v", path[i], path[i+1], err)
			}
		}
	})

	t.Run("lease expiry path", func(t *testing.T) {
		// Running → pending is allowed (T4 mid-execution expiry).
		if err := ValidateStepTransition(StepRunning, StepPending); err != nil {
			t.Errorf("want nil, got %v", err)
		}
		// Leased → pending is allowed (T4 pre-start expiry).
		if err := ValidateStepTransition(StepLeased, StepPending); err != nil {
			t.Errorf("want nil, got %v", err)
		}
	})

	t.Run("cannot resurrect succeeded", func(t *testing.T) {
		for _, to := range []StepState{StepPending, StepLeased, StepRunning, StepFailed} {
			if err := ValidateStepTransition(StepSucceeded, to); err == nil {
				t.Errorf("want error for succeeded → %s, got nil", to)
			}
		}
	})

	t.Run("cannot skip leased when starting", func(t *testing.T) {
		// A Step must pass through 'leased' (etcd CAS) before 'running'.
		if err := ValidateStepTransition(StepPending, StepRunning); err == nil {
			t.Errorf("want error for pending → running, got nil")
		}
	})

	t.Run("terminals", func(t *testing.T) {
		for _, s := range []StepState{StepSucceeded, StepFailed, StepCancelled, StepExpired} {
			if !IsStepTerminal(s) {
				t.Errorf("%s should be terminal", s)
			}
		}
		for _, s := range []StepState{StepPending, StepLeased, StepRunning} {
			if IsStepTerminal(s) {
				t.Errorf("%s should not be terminal", s)
			}
		}
	})
}

func TestFlowFSM(t *testing.T) {
	t.Run("valid path", func(t *testing.T) {
		path := []FlowState{FlowPending, FlowAssigned, FlowRunning, FlowSucceeded}
		for i := 0; i < len(path)-1; i++ {
			if err := ValidateFlowTransition(path[i], path[i+1]); err != nil {
				t.Errorf("want nil for %s → %s, got %v", path[i], path[i+1], err)
			}
		}
	})

	t.Run("reassignment allowed", func(t *testing.T) {
		if err := ValidateFlowTransition(FlowAssigned, FlowPending); err != nil {
			t.Errorf("want nil for reassignment, got %v", err)
		}
	})

	t.Run("running cannot go back to assigned", func(t *testing.T) {
		if err := ValidateFlowTransition(FlowRunning, FlowAssigned); err == nil {
			t.Errorf("want error for running → assigned, got nil")
		}
	})
}

func TestSideEffectFSM(t *testing.T) {
	t.Run("valid path", func(t *testing.T) {
		if err := ValidateSideEffectTransition(SEPending, SEExecuting); err != nil {
			t.Errorf("want nil, got %v", err)
		}
		if err := ValidateSideEffectTransition(SEExecuting, SECommitted); err != nil {
			t.Errorf("want nil, got %v", err)
		}
	})

	t.Run("cannot reverse committed", func(t *testing.T) {
		for _, to := range []SideEffectState{SEPending, SEExecuting, SEFailed} {
			if err := ValidateSideEffectTransition(SECommitted, to); err == nil {
				t.Errorf("want error for committed → %s, got nil", to)
			}
		}
	})
}
