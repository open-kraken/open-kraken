/**
 * RunsPage — AEL execution monitoring dashboard.
 *
 * Lists all runs with state badges, expandable flows → steps hierarchy,
 * and a "New Run" dialog. Polls every 5 seconds.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listRuns, createRun, listRunFlows, updateRunState } from '@/api/v2/runs';
import { createFlow, createStep, getFlowSteps } from '@/api/v2/steps';
import type { RunDTO, FlowDTO, StepDTO, RunState, CreateRunInput, CreateFlowInput, CreateStepInput } from '@/api/v2/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  Play,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';

/* ── Helpers ── */

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── State badge ── */

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
    pending: {
      className: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
      icon: <Clock size={11} />,
      label: 'Pending',
    },
    running: {
      className: 'bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300',
      icon: <Play size={11} />,
      label: 'Running',
    },
    succeeded: {
      className: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300',
      icon: <CheckCircle size={11} />,
      label: 'Succeeded',
    },
    failed: {
      className: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300',
      icon: <AlertCircle size={11} />,
      label: 'Failed',
    },
    cancelled: {
      className: 'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
      icon: <XCircle size={11} />,
      label: 'Cancelled',
    },
  };
  const c = cfg[state] ?? cfg.pending;
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${c.className}`}>
      {c.icon}
      {c.label}
    </Badge>
  );
}

const RUN_STATES: RunState[] = ['pending', 'running', 'succeeded', 'failed', 'cancelled'];

/* ── New Run Dialog ── */

const DEFAULT_FORM: CreateRunInput = {
  tenant_id: 'default',
  hive_id: '',
  objective: '',
  token_budget: 10000,
};

function NewRunDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateRunInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateRunInput>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.objective.trim() || !form.hive_id.trim()) {
      setError('Hive ID and Objective are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate(form);
      setForm(DEFAULT_FORM);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run.');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof CreateRunInput, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Run</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="hive_id">Hive ID</Label>
            <Input
              id="hive_id"
              placeholder="hive-alpha"
              value={form.hive_id}
              onChange={(e) => field('hive_id', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant_id">Tenant ID</Label>
            <Input
              id="tenant_id"
              placeholder="default"
              value={form.tenant_id}
              onChange={(e) => field('tenant_id', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="objective">Objective</Label>
            <Input
              id="objective"
              placeholder="Describe the run objective..."
              value={form.objective}
              onChange={(e) => field('objective', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token_budget">Token Budget</Label>
            <Input
              id="token_budget"
              type="number"
              min={1000}
              step={1000}
              value={form.token_budget}
              onChange={(e) => field('token_budget', Number(e.target.value))}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
              Create Run
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_FLOW_FORM = {
  agent_role: 'assistant',
};

function AddFlowDialog({
  open,
  run,
  onClose,
  onCreate,
}: {
  open: boolean;
  run: RunDTO;
  onClose: () => void;
  onCreate: (input: CreateFlowInput) => Promise<void>;
}) {
  const [agentRole, setAgentRole] = useState(DEFAULT_FLOW_FORM.agent_role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agentRole.trim()) {
      setError('Agent role is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        run_id: run.id,
        tenant_id: run.tenant_id || 'default',
        agent_role: agentRole.trim(),
      });
      setAgentRole(DEFAULT_FLOW_FORM.agent_role);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Flow</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="flow_agent_role">Agent Role</Label>
            <Input
              id="flow_agent_role"
              value={agentRole}
              onChange={(event) => setAgentRole(event.target.value)}
              placeholder="assistant"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
              Add Flow
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStepDialog({
  open,
  flow,
  onClose,
  onCreate,
}: {
  open: boolean;
  flow: FlowDTO;
  onClose: () => void;
  onCreate: (input: CreateStepInput) => Promise<void>;
}) {
  const [workloadClass, setWorkloadClass] = useState('general');
  const [regime, setRegime] = useState('OPAQUE');
  const [agentType, setAgentType] = useState('assistant');
  const [provider, setProvider] = useState('codex');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workloadClass.trim() || !agentType.trim() || !provider.trim()) {
      setError('Workload, agent type, and provider are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        flow_id: flow.id,
        run_id: flow.run_id,
        tenant_id: flow.tenant_id || 'default',
        workload_class: workloadClass.trim(),
        regime,
        agent_type: agentType.trim(),
        provider: provider.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create step.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Step</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="step_workload">Workload Class</Label>
            <Input id="step_workload" value={workloadClass} onChange={(event) => setWorkloadClass(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="step_regime">Regime</Label>
            <Select value={regime} onValueChange={setRegime}>
              <SelectTrigger id="step_regime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPAQUE">OPAQUE</SelectItem>
                <SelectItem value="VERIFIABLE">VERIFIABLE</SelectItem>
                <SelectItem value="PROXIED">PROXIED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="step_agent">Agent Type</Label>
            <Input id="step_agent" value={agentType} onChange={(event) => setAgentType(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="step_provider">Provider</Label>
            <Input id="step_provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
              Add Step
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Expanded run detail: flows → steps ── */

function RunDetail({ run, onRefresh }: { run: RunDTO; onRefresh: () => Promise<void> }) {
  const [flows, setFlows] = useState<FlowDTO[]>(run.flows ?? []);
  const [stepsByFlow, setStepsByFlow] = useState<Record<string, StepDTO[]>>({});
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [flowDialogOpen, setFlowDialogOpen] = useState(false);
  const [stepFlow, setStepFlow] = useState<FlowDTO | null>(null);

  useEffect(() => {
    if (run.flows && run.flows.length > 0) {
      setFlows(run.flows);
      return;
    }
    setLoadingFlows(true);
    listRunFlows(run.id)
      .then(setFlows)
      .catch(() => setFlows([]))
      .finally(() => setLoadingFlows(false));
  }, [run.id, run.flows]);

  const toggleFlow = useCallback(
    async (flowId: string) => {
      setExpandedFlows((prev) => {
        const next = new Set(prev);
        if (next.has(flowId)) {
          next.delete(flowId);
        } else {
          next.add(flowId);
        }
        return next;
      });
      if (!stepsByFlow[flowId]) {
        try {
          const steps = await getFlowSteps(flowId);
          setStepsByFlow((prev) => ({ ...prev, [flowId]: steps }));
        } catch {
          setStepsByFlow((prev) => ({ ...prev, [flowId]: [] }));
        }
      }
    },
    [stepsByFlow]
  );

  const handleCreateFlow = async (input: CreateFlowInput) => {
    await createFlow(input);
    const next = await listRunFlows(run.id);
    setFlows(next);
    await onRefresh();
  };

  const handleCreateStep = async (input: CreateStepInput) => {
    const saved = await createStep(input);
    setStepsByFlow((prev) => ({
      ...prev,
      [input.flow_id]: [...(prev[input.flow_id] ?? []), saved],
    }));
    setExpandedFlows((prev) => new Set(prev).add(input.flow_id));
  };

  if (loadingFlows) {
    return (
      <div className="px-6 py-4 text-xs app-text-faint flex items-center gap-2">
        <RefreshCw size={12} className="animate-spin" /> Loading flows…
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        <span className="text-xs app-text-faint">No flows recorded for this run.</span>
        <Button variant="outline" size="sm" onClick={() => setFlowDialogOpen(true)}>
          <Plus size={14} className="mr-1" /> Add Flow
        </Button>
        <AddFlowDialog open={flowDialogOpen} run={run} onClose={() => setFlowDialogOpen(false)} onCreate={handleCreateFlow} />
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs app-text-faint">Flows define execution branches under this run. Steps are the schedulable work records.</p>
        <Button variant="outline" size="sm" onClick={() => setFlowDialogOpen(true)}>
          <Plus size={14} className="mr-1" /> Add Flow
        </Button>
      </div>
      {flows.map((flow) => {
        const isExpanded = expandedFlows.has(flow.id);
        const steps = stepsByFlow[flow.id] ?? [];
        return (
          <Card key={flow.id} className="overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
              onClick={() => void toggleFlow(flow.id)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-xs font-mono app-text-faint truncate w-40">{flow.id}</span>
              <span className="text-xs app-text-strong font-medium">{flow.agent_role || 'unknown role'}</span>
              <StateBadge state={flow.state} />
              <span className="ml-auto text-xs app-text-faint">{relativeTime(flow.created_at)}</span>
            </button>

            {isExpanded && (
              <div className="border-t app-border-subtle">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs app-text-faint">{steps.length} steps</span>
                  <Button variant="outline" size="sm" onClick={() => setStepFlow(flow)}>
                    <Plus size={14} className="mr-1" /> Add Step
                  </Button>
                </div>
                {steps.length === 0 ? (
                  <div className="px-8 py-3 text-xs app-text-faint">No steps recorded.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                        <TableHead className="text-xs w-40">Step ID</TableHead>
                        <TableHead className="text-xs">Workload</TableHead>
                        <TableHead className="text-xs">Agent</TableHead>
                        <TableHead className="text-xs">Provider</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {steps.map((step) => (
                        <TableRow key={step.id} className="text-xs">
                          <TableCell className="font-mono app-text-faint truncate max-w-[140px]">{step.id}</TableCell>
                          <TableCell>{step.workload_class}</TableCell>
                          <TableCell>{step.agent_type}</TableCell>
                          <TableCell>{step.provider}</TableCell>
                          <TableCell><StateBadge state={step.state} /></TableCell>
                          <TableCell className="text-right app-text-faint">{relativeTime(step.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </Card>
        );
      })}
      <AddFlowDialog open={flowDialogOpen} run={run} onClose={() => setFlowDialogOpen(false)} onCreate={handleCreateFlow} />
      {stepFlow && (
        <AddStepDialog
          open={Boolean(stepFlow)}
          flow={stepFlow}
          onClose={() => setStepFlow(null)}
          onCreate={handleCreateStep}
        />
      )}
    </div>
  );
}

/* ── Main Page ── */

export const RunsPage = () => {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'unavailable'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tenantFilter, setTenantFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | RunState>('all');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoadState((current) => (runs.length === 0 && current !== 'unavailable' ? 'loading' : current));
    setLoadError(null);
    try {
      const data = await listRuns({
        tenant_id: tenantFilter.trim() || undefined,
        state: stateFilter === 'all' ? undefined : stateFilter,
        limit: 100,
      });
      setRuns(Array.isArray(data) ? data : []);
      setLoadState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load runs.';
      const isUnavailable =
        err instanceof Error &&
        (err.message.includes('503') ||
          err.message.toLowerCase().includes('unavailable') ||
          err.message.toLowerCase().includes('ael not configured'));
      setLoadError(message);
      setLoadState(isUnavailable ? 'unavailable' : 'error');
    }
  }, [runs.length, stateFilter, tenantFilter]);

  // Initial load + 5-second polling
  useEffect(() => {
    void load();
    pollingRef.current = setInterval(() => { void load(); }, 5_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  const handleCreate = useCallback(
    async (input: CreateRunInput) => {
      await createRun(input);
      await load();
    },
    [load]
  );

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const handleRunState = async (event: React.MouseEvent, run: RunDTO, state: RunState) => {
    event.stopPropagation();
    await updateRunState(run.id, state);
    await load();
  };

  const nextRunActions = (run: RunDTO): RunState[] => {
    switch (run.state) {
      case 'pending':
        return ['running', 'cancelled'];
      case 'running':
        return ['succeeded', 'failed', 'cancelled'];
      default:
        return [];
    }
  };

  /* ── Empty / error states ── */
  if (loadState === 'unavailable') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 app-text-muted">
        <AlertCircle size={48} className="opacity-30" />
        <div className="text-center">
          <p className="text-sm font-semibold app-text-strong">AEL not configured</p>
          <p className="text-xs app-text-faint mt-1">
            Runs are backed by the AEL PostgreSQL service. Configure OPEN_KRAKEN_POSTGRES_DSN and run the AEL migrations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw size={14} className="mr-1" /> Retry
        </Button>
      </div>
    );
  }

  const pendingCount = runs.filter((r) => r.state === 'pending').length;
  const runningCount = runs.filter((r) => r.state === 'running').length;
  const succeededCount = runs.filter((r) => r.state === 'succeeded').length;
  const failedCount = runs.filter((r) => r.state === 'failed').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Execution Runs</h1>
              <p className="text-xs app-text-faint">
                AEL state ledger: run lifecycle, execution flows, schedulable steps, and token budget.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{runs.length}</span>
                <span className="app-text-faint">total</span>
              </div>
              {runningCount > 0 && (
                <>
                  <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="font-semibold app-text-strong">{runningCount}</span>
                    <span className="app-text-faint">running</span>
                  </div>
                </>
              )}
              {failedCount > 0 && (
                <>
                  <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={12} className="text-red-500" />
                    <span className="font-semibold text-red-600">{failedCount}</span>
                    <span className="app-text-faint">failed</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={tenantFilter}
              onChange={(event) => setTenantFilter(event.target.value)}
              placeholder="tenant"
              className="h-8 w-28 text-xs"
            />
            <Select value={stateFilter} onValueChange={(value) => setStateFilter(value as 'all' | RunState)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {RUN_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
              <RefreshCw size={14} className="mr-1" />
              Refresh
            </Button>
            <Button size="sm" className="h-8" onClick={() => setDialogOpen(true)}>
              <Plus size={14} className="mr-1" />
              New Run
            </Button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex items-center gap-2 mt-2">
          <StateBadge state="pending" />
          <span className="text-xs app-text-faint">{pendingCount}</span>
          <StateBadge state="running" />
          <span className="text-xs app-text-faint">{runningCount}</span>
          <StateBadge state="succeeded" />
          <span className="text-xs app-text-faint">{succeededCount}</span>
          <StateBadge state="failed" />
          <span className="text-xs app-text-faint">{failedCount}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loadState === 'loading' && runs.length === 0 && (
          <div className="text-center py-12 app-text-muted">
            <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-50" />
            <p className="text-sm">Loading runs…</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="text-center py-12">
            <p className="text-sm text-red-500">Failed to load runs.</p>
            {loadError && <p className="mt-1 text-xs app-text-faint">{loadError}</p>}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        {runs.length === 0 && loadState === 'idle' && (
          <div className="text-center py-12 app-text-muted">
            <Activity size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">No runs yet. Create one to get started.</p>
            <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus size={14} className="mr-1" /> New Run
            </Button>
          </div>
        )}

        {runs.length > 0 && (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="w-10" />
                  <TableHead className="w-[220px]">Run ID</TableHead>
                  <TableHead>Objective</TableHead>
                  <TableHead className="w-[100px]">Hive</TableHead>
                  <TableHead className="w-[110px]">State</TableHead>
                  <TableHead className="w-[110px] text-right">Tokens</TableHead>
                  <TableHead className="w-[100px] text-right">Created</TableHead>
                  <TableHead className="w-[210px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const isExpanded = expandedId === run.id;
                  return (
                    <React.Fragment key={run.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        onClick={() => toggleExpand(run.id)}
                      >
                        <TableCell>
                          <button type="button" className="app-text-muted hover:app-text-strong">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </TableCell>
                        <TableCell className="font-mono text-xs app-text-faint truncate max-w-[220px]">
                          {run.id}
                        </TableCell>
                        <TableCell className="text-sm app-text-strong max-w-xs truncate">
                          {run.objective || '—'}
                        </TableCell>
                        <TableCell className="text-xs app-text-muted font-mono truncate">
                          {run.hive_id || '—'}
                        </TableCell>
                        <TableCell>
                          <StateBadge state={run.state} />
                        </TableCell>
                        <TableCell className="text-right text-xs app-text-faint">
                          {run.tokens_used.toLocaleString()} / {run.token_budget.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs app-text-faint">
                          {relativeTime(run.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {nextRunActions(run).map((state) => (
                              <Button
                                key={state}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={(event) => void handleRunState(event, run, state)}
                              >
                                {state}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="p-0 bg-gray-50 dark:bg-gray-900/40">
                            <RunDetail run={run} onRefresh={load} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <NewRunDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
};
