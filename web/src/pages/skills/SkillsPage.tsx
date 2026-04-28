/**
 * SkillsPage -- tree-based skill catalog with detail panel.
 * Keeps existing API calls (getSkills, getMemberSkills, updateMemberSkills)
 * and export/import snapshot functionality.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Boxes,
  Zap,
  Plus,
  Download,
  Upload,
  Search,
  Package,
  Users,
  Code,
  Terminal,
  Clock,
  CheckCircle,
  AlertCircle,
  FileCode,
  RotateCcw,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { appEnv } from '@/config/env';
import { getSkills, getMemberSkills, reloadSkills, updateMemberSkills } from '@/api/skills';
import {
  buildSkillsSnapshot,
  downloadJson,
  isSkillsSnapshotV1,
  skillsFromNames,
  type SkillsSnapshotV1,
} from '@/features/skills/skills-snapshot';
import type { Skill, SkillCategory } from '@/types/skill';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { PixelAvatar } from '@/components/ui/pixel-avatar';
import { StatusDot } from '@/components/ui/status-dot';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { listSkillDefinitions, createSkillDefinition } from '@/api/v2/skills';
import type { SkillDefinitionDTO, CreateSkillInput } from '@/api/v2/types';
import { normalizeMembersEnvelope, type MemberFixture } from '@/features/members/member-page-model';

/* ── Skill Tree types ── */

interface SkillTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'skill';
  category?: SkillCategory;
  description?: string;
  version?: string;
  language?: string;
  path?: string;
  usedBy?: Array<{
    agentId: string;
    agentName: string;
    status: 'active' | 'idle' | 'error';
    lastUsed: string;
    usageCount: number;
  }>;
  code?: string;
  dependencies?: string[];
  children?: SkillTreeNode[];
}

type SkillUsage = NonNullable<SkillTreeNode['usedBy']>[number];

type SkillBindingMap = Record<string, Skill[]>;

/** Canonical display order for skill categories. */
const CATEGORY_ORDER: SkillCategory[] = ['tech-lead', 'golang', 'react', 'qa', 'devops', 'other'];

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  'tech-lead': 'Tech Lead',
  golang: 'Golang',
  react: 'React / Frontend',
  qa: 'QA / Testing',
  devops: 'DevOps',
  other: 'Other',
};

const isAssistantMember = (member: MemberFixture) =>
  member.roleType === 'assistant' ||
  Boolean(member.agentInstanceId) ||
  Boolean(member.runtimeReady) ||
  Boolean(member.agentRuntimeState);

const assistantRuntimeStatus = (member: MemberFixture): SkillUsage['status'] => {
  const raw = String(member.agentRuntimeState ?? member.terminalStatus ?? member.status ?? '').toLowerCase();
  if (['error', 'failed', 'crashed'].includes(raw)) return 'error';
  if (['running', 'working', 'busy', 'attached', 'online'].includes(raw)) return 'active';
  return 'idle';
};

const buildUsageBySkill = (assistants: MemberFixture[], bindings: SkillBindingMap) => {
  const byId = new Map(assistants.map((member) => [member.memberId, member]));
  const usage = new Map<string, SkillUsage[]>();

  for (const [memberId, memberSkills] of Object.entries(bindings)) {
    const member = byId.get(memberId);
    if (!member) continue;
    for (const skill of memberSkills) {
      const list = usage.get(skill.name) ?? [];
      list.push({
        agentId: member.memberId,
        agentName: member.displayName ?? member.memberId,
        status: assistantRuntimeStatus(member),
        lastUsed: member.lastUpdatedAt ? new Date(member.lastUpdatedAt).toLocaleString() : 'Assigned',
        usageCount: 0,
      });
      usage.set(skill.name, list);
    }
  }

  return usage;
};

function buildTreeFromSkills(skills: Skill[], usageBySkill: Map<string, SkillUsage[]>): SkillTreeNode[] {
  const grouped = new Map<SkillCategory, Skill[]>();
  for (const s of skills) {
    const existing = grouped.get(s.category);
    if (existing) {
      existing.push(s);
    } else {
      grouped.set(s.category, [s]);
    }
  }

  return CATEGORY_ORDER
    .filter((cat) => grouped.has(cat))
    .map((cat) => ({
      id: cat,
      name: CATEGORY_LABELS[cat],
      type: 'folder' as const,
      children: (grouped.get(cat) ?? []).map((s) => ({
        id: s.path || s.name,
        name: s.name,
        type: 'skill' as const,
        category: s.category,
        description: s.description,
        version: '1.0.0',
        language: s.category === 'golang' ? 'Go' : s.category === 'react' ? 'TypeScript' : 'Python',
        path: s.path,
        usedBy: usageBySkill.get(s.name) ?? [],
        dependencies: [],
      })),
    }));
}

/* ── Tree node component ── */

function TreeNode({
  node,
  level = 0,
  onSelectSkill,
  selectedSkillId,
}: {
  node: SkillTreeNode;
  level?: number;
  onSelectSkill: (skill: SkillTreeNode) => void;
  selectedSkillId: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(level === 0);

  const isFolder = node.type === 'folder';
  const isSelected = selectedSkillId === node.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:app-surface-strong transition-colors ${
          isSelected ? 'app-surface-strong' : ''
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            setIsExpanded(!isExpanded);
          } else {
            onSelectSkill(node);
          }
        }}
      >
        {isFolder && (
          <div className="w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown size={14} className="app-text-muted" />
            ) : (
              <ChevronRight size={14} className="app-text-muted" />
            )}
          </div>
        )}
        {!isFolder && <div className="w-4" />}

        {isFolder ? (
          <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0">
            <Boxes size={10} className="text-white" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
            <Zap size={10} className="text-white" />
          </div>
        )}

        <span
          className={`flex-1 text-sm truncate ${
            isFolder ? 'font-semibold app-text-strong' : 'app-text-strong'
          }`}
        >
          {node.name}
        </span>

        {!isFolder && node.usedBy && node.usedBy.length > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 shrink-0">
            {node.usedBy.length}
          </Badge>
        )}
      </div>

      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelectSkill={onSelectSkill}
              selectedSkillId={selectedSkillId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AEL Skill Definitions Tab (v2) ── */

const NEW_SKILL_DEFAULT: CreateSkillInput = {
  name: '',
  version: 1,
  description: '',
  prompt_template: '',
  tool_requirements: [],
  agent_type_affinity: [],
  workload_class_tags: [],
};

function AelSkillDefinitionsTab() {
  const [defs, setDefs] = useState<SkillDefinitionDTO[]>([]);
  const [libState, setLibState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateSkillInput>(NEW_SKILL_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SkillDefinitionDTO | null>(null);

  const loadDefs = useCallback(async () => {
    setLibState('loading');
    try {
      const data = await listSkillDefinitions({ limit: 100 });
      setDefs(Array.isArray(data) ? data : []);
      setLibState('idle');
    } catch {
      setLibState('error');
    }
  }, []);

  useEffect(() => { void loadDefs(); }, [loadDefs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.prompt_template.trim()) {
      setFormError('Name and Prompt Template are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createSkillDefinition(form);
      setForm(NEW_SKILL_DEFAULT);
      setShowForm(false);
      await loadDefs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create skill.');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof CreateSkillInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: skill list */}
      <div className="w-[320px] app-surface-strong border-r app-border-subtle flex flex-col">
        <div className="p-3 border-b app-border-subtle flex items-center justify-between">
          <span className="text-xs font-semibold app-text-faint uppercase tracking-wider">
            {defs.length} definition{defs.length !== 1 ? 's' : ''}
          </span>
          <Button size="sm" className="h-7" onClick={() => { setShowForm(true); setSelected(null); }}>
            <Plus size={12} className="mr-1" /> New Definition
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {libState === 'loading' && defs.length === 0 && (
              <div className="text-center py-8 app-text-faint text-sm">Loading…</div>
            )}
            {libState === 'error' && (
              <div className="text-center py-8 text-red-500 text-sm">
                Failed to load AEL definitions.
                <Button variant="ghost" size="sm" className="block mx-auto mt-2" onClick={() => void loadDefs()}>
                  Retry
                </Button>
              </div>
            )}
            {defs.length === 0 && libState === 'idle' && (
              <div className="text-center py-8 app-text-faint text-sm">No AEL skill definitions yet.</div>
            )}
            {defs.map((def) => (
              <button
                key={def.id}
                type="button"
                className={`w-full flex items-start gap-2 px-3 py-2.5 rounded text-left hover:app-surface-strong transition-colors ${
                  selected?.id === def.id ? 'app-surface-strong' : ''
                }`}
                onClick={() => { setSelected(def); setShowForm(false); }}
              >
                <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap size={10} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium app-text-strong truncate">{def.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">v{def.version}</Badge>
                    <span className="text-[10px] app-text-faint truncate">{def.description || 'No description'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right: detail or form */}
      <div className="flex-1 overflow-auto p-6">
        {showForm && (
          <div className="max-w-xl">
            <h2 className="text-base font-bold app-text-strong mb-1">New AEL Skill Definition</h2>
            <p className="text-sm app-text-muted mb-4">
              These definitions are used by the AEL runtime matcher. They do not become assignable catalog skills until backend promotion is implemented.
            </p>
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lib-name">Name</Label>
                <Input id="lib-name" placeholder="my-skill" value={form.name} onChange={(e) => field('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lib-version">Version</Label>
                <Input
                  id="lib-version"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="1"
                  value={String(form.version)}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      version: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lib-desc">Description</Label>
                <Input id="lib-desc" placeholder="Short description" value={form.description} onChange={(e) => field('description', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lib-prompt">Prompt Template</Label>
                <Textarea
                  id="lib-prompt"
                  rows={8}
                  placeholder="You are a helpful agent that..."
                  value={form.prompt_template}
                  onChange={(e) => field('prompt_template', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Create Definition'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {!showForm && selected && (
          <div className="max-w-xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                <Zap size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold app-text-strong">{selected.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">v{selected.version}</Badge>
                  {selected.tenant_id && (
                    <span className="text-xs app-text-faint font-mono">{selected.tenant_id}</span>
                  )}
                </div>
              </div>
            </div>

            {selected.description && (
              <Card className="p-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-2">Description</div>
                <p className="text-sm app-text-strong">{selected.description}</p>
              </Card>
            )}

            {selected.tags && selected.tags.length > 0 && (
              <Card className="p-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-2">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </Card>
            )}

            <Card className="overflow-hidden">
              <div className="app-surface-strong border-b app-border-subtle px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs app-text-faint">
                  <FileCode size={14} />
                  <span className="font-mono">prompt_template</span>
                </div>
              </div>
              <pre className="p-4 text-xs font-mono app-text-strong overflow-x-auto bg-gray-50 dark:bg-gray-900/50 whitespace-pre-wrap">
                {selected.prompt_template || '— no template —'}
              </pre>
            </Card>

            <div className="text-xs app-text-faint">
              Created {new Date(selected.created_at).toLocaleString()}
            </div>
          </div>
        )}

        {!showForm && !selected && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <FileCode size={48} className="app-text-faint mx-auto mb-4" />
              <h3 className="text-lg font-semibold app-text-strong mb-2">Select an AEL definition</h3>
              <p className="text-sm app-text-muted">Choose a runtime definition from the list or create a new one.</p>
              <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
                <Plus size={14} className="mr-1" /> New Definition
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillAssignmentsTab({
  skills,
  assistants,
  bindings,
  loading,
  onReload,
}: {
  skills: Skill[];
  assistants: MemberFixture[];
  bindings: SkillBindingMap;
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (selectedAssistantId && assistants.some((member) => member.memberId === selectedAssistantId)) {
      return;
    }
    setSelectedAssistantId(assistants[0]?.memberId ?? null);
  }, [assistants, selectedAssistantId]);

  useEffect(() => {
    if (!selectedAssistantId) {
      setDraft(new Set());
      return;
    }
    setDraft(new Set((bindings[selectedAssistantId] ?? []).map((skill) => skill.name)));
  }, [bindings, selectedAssistantId]);

  const selectedAssistant = assistants.find((member) => member.memberId === selectedAssistantId) ?? null;
  const selectedSkills = useMemo(
    () => skills.filter((skill) => draft.has(skill.name)),
    [draft, skills],
  );
  const filteredSkills = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(lower) ||
        skill.description.toLowerCase().includes(lower) ||
        skill.category.toLowerCase().includes(lower),
    );
  }, [query, skills]);

  const setSkillEnabled = (skillName: string, enabled: boolean) => {
    setNotice(null);
    setDraft((current) => {
      const next = new Set(current);
      if (enabled) {
        next.add(skillName);
      } else {
        next.delete(skillName);
      }
      return next;
    });
  };

  const save = async () => {
    if (!selectedAssistantId) return;
    setSaving(true);
    setNotice(null);
    try {
      await updateMemberSkills(selectedAssistantId, { skills: selectedSkills });
      await onReload();
      setNotice({ tone: 'ok', text: 'Skill assignments saved.' });
    } catch (err) {
      setNotice({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Failed to save skill assignments.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && assistants.length === 0) {
    return <div className="p-6 text-sm app-text-faint">Loading AI Assistants...</div>;
  }

  if (assistants.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <Users size={32} className="app-text-faint mx-auto mb-3" />
          <h2 className="text-base font-semibold app-text-strong mb-2">No AI Assistants Found</h2>
          <p className="text-sm app-text-muted">
            Create an AI Assistant from Members first. Skills can only be assigned to AI Assistant members.
          </p>
        </Card>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <Package size={32} className="app-text-faint mx-auto mb-3" />
          <h2 className="text-base font-semibold app-text-strong mb-2">No Assignable Skills</h2>
          <p className="text-sm app-text-muted">
            Add markdown skills to the skills directory and reload the assignable catalog before assigning them to AI Assistants.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-[340px] app-surface-strong border-r app-border-subtle flex flex-col">
        <div className="p-4 border-b app-border-subtle">
          <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
            AI Assistants
          </div>
          <div className="text-sm app-text-muted">
            {assistants.length} assistant{assistants.length === 1 ? '' : 's'} can receive skills.
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {assistants.map((member) => {
              const assignedCount = bindings[member.memberId]?.length ?? 0;
              const active = member.memberId === selectedAssistantId;
              return (
                <button
                  key={member.memberId}
                  type="button"
                  className={`w-full flex items-center gap-3 rounded px-3 py-2.5 text-left hover:app-surface-strong ${
                    active ? 'app-surface-strong' : ''
                  }`}
                  onClick={() => {
                    setSelectedAssistantId(member.memberId);
                    setNotice(null);
                  }}
                >
                  <PixelAvatar name={member.displayName ?? member.memberId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium app-text-strong truncate">
                      {member.displayName ?? member.memberId}
                    </div>
                    <div className="flex items-center gap-2 text-xs app-text-faint">
                      <StatusDot
                        status={
                          assistantRuntimeStatus(member) === 'active'
                            ? 'success'
                            : assistantRuntimeStatus(member) === 'error'
                              ? 'error'
                              : 'idle'
                        }
                      />
                      <span>{member.agentRuntimeState ?? member.terminalStatus ?? 'idle'}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {assignedCount}
                  </Badge>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold app-text-strong">
                {selectedAssistant?.displayName ?? selectedAssistant?.memberId ?? 'AI Assistant'} Skills
              </h2>
              <p className="text-sm app-text-muted mt-1">
                Assign catalog skills that this AI Assistant should load during initialization.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void onReload()} disabled={loading || saving}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDraft(new Set())} disabled={saving}>
                Clear All
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={!selectedAssistantId || saving}>
                <CheckCircle size={14} className="mr-1" />
                {saving ? 'Saving...' : 'Save Skills'}
              </Button>
            </div>
          </div>

          {notice && (
            <div
              className={`flex items-center gap-2 text-sm ${
                notice.tone === 'ok' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {notice.tone === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-xs app-text-faint mb-1">Assigned Skills</div>
              <div className="text-2xl font-bold app-text-strong">{draft.size}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs app-text-faint mb-1">Catalog Skills</div>
              <div className="text-2xl font-bold app-text-strong">{skills.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs app-text-faint mb-1">Assistant Runtime</div>
              <div className="text-sm font-semibold app-text-strong capitalize">
                {selectedAssistant?.agentRuntimeState ?? selectedAssistant?.terminalStatus ?? 'idle'}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="relative mb-4">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search assignable skills..."
                className="pl-9 h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              {filteredSkills.length === 0 ? (
                <div className="py-8 text-center text-sm app-text-faint">No skills match this search.</div>
              ) : (
                filteredSkills.map((skill) => {
                  const checked = draft.has(skill.name);
                  return (
                    <label
                      key={skill.name}
                      className="flex items-start gap-3 rounded border app-border-subtle p-3 hover:app-surface-strong cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => setSkillEnabled(skill.name, value === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold app-text-strong">{skill.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {skill.category}
                          </Badge>
                        </div>
                        <p className="text-sm app-text-muted mt-1">{skill.description}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Page component ── */

export const SkillsPage = () => {
  const { t } = useI18n();
  const { apiClient } = useAppShell();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'assignments' | 'library'>('assignments');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [assignmentState, setAssignmentState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [assistantMembers, setAssistantMembers] = useState<MemberFixture[]>([]);
  const [skillBindings, setSkillBindings] = useState<SkillBindingMap>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reloadingCatalog, setReloadingCatalog] = useState(false);
  const [preview, setPreview] = useState<SkillsSnapshotV1 | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoadState('loading');
    setMessage(null);
    try {
      const r = await getSkills();
      setSkills(r.skills);
      setLoadState('idle');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleReloadCatalog = useCallback(async () => {
    setReloadingCatalog(true);
    setMessage(null);
    try {
      const result = await reloadSkills();
      await loadCatalog();
      setSelectedSkillId(null);
      const loadedText = typeof result.loaded === 'number' ? `${result.loaded} skills loaded.` : 'Catalog reloaded.';
      setMessage({ tone: 'ok', text: loadedText });
    } catch (e) {
      setMessage({
        tone: 'err',
        text: e instanceof Error ? e.message : 'Failed to reload assignable skill catalog.',
      });
    } finally {
      setReloadingCatalog(false);
    }
  }, [loadCatalog]);

  const loadAssignments = useCallback(async () => {
    setAssignmentState('loading');
    try {
      const membersResponse = await apiClient.getMembers();
      const assistants = normalizeMembersEnvelope(membersResponse).filter(isAssistantMember);
      const entries = await Promise.all(
        assistants.map(async (member) => {
          try {
            const response = await getMemberSkills(member.memberId);
            return [member.memberId, response.skills ?? []] as const;
          } catch {
            return [member.memberId, []] as const;
          }
        }),
      );
      setAssistantMembers(assistants);
      setSkillBindings(Object.fromEntries(entries));
      setAssignmentState('idle');
    } catch {
      setAssistantMembers([]);
      setSkillBindings({});
      setAssignmentState('error');
    }
  }, [apiClient]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setMessage(null);
    try {
      const snap = await buildSkillsSnapshot(
        appEnv.defaultWorkspaceId,
        () => apiClient.getMembers(),
        () => getSkills(),
        (id) => getMemberSkills(id),
      );
      downloadJson(
        `open-kraken-skills-${appEnv.defaultWorkspaceId}-${new Date().toISOString().slice(0, 10)}.json`,
        snap,
      );
      setMessage({ tone: 'ok', text: t('skillsPage.exportDone') });
    } catch (e) {
      setMessage({
        tone: 'err',
        text: e instanceof Error ? e.message : t('skillsPage.exportFailed'),
      });
    } finally {
      setExporting(false);
    }
  }, [apiClient, t]);

  const onPickFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setMessage(null);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (!isSkillsSnapshotV1(parsed)) {
          setPreview(null);
          setMessage({ tone: 'err', text: t('skillsPage.importInvalid') });
          return;
        }
        setPreview(parsed);
        setMessage({ tone: 'ok', text: t('skillsPage.importPreviewReady') });
      } catch {
        setPreview(null);
        setMessage({ tone: 'err', text: t('skillsPage.importParseFailed') });
      }
    },
    [t],
  );

  const applyImport = useCallback(async () => {
    if (!preview) return;
    setImporting(true);
    setMessage(null);
    const errors: string[] = [];
    try {
      const entries = Object.entries(preview.memberBindings);
      for (const [memberId, names] of entries) {
        try {
          const resolved = skillsFromNames(names, preview.catalog);
          await updateMemberSkills(memberId, { skills: resolved });
        } catch (err) {
          errors.push(`${memberId}: ${err instanceof Error ? err.message : 'failed'}`);
        }
      }
      if (errors.length > 0) {
        setMessage({ tone: 'err', text: errors.join('\n') });
      } else {
        setMessage({ tone: 'ok', text: t('skillsPage.applyDone') });
        setPreview(null);
        void loadCatalog();
        void loadAssignments();
      }
    } finally {
      setImporting(false);
    }
  }, [preview, loadCatalog, loadAssignments, t]);

  const usageBySkill = useMemo(
    () => buildUsageBySkill(assistantMembers, skillBindings),
    [assistantMembers, skillBindings],
  );
  const skillTree = useMemo(() => buildTreeFromSkills(skills, usageBySkill), [skills, usageBySkill]);

  // Compute stats
  const getAllSkills = (nodes: SkillTreeNode[]): SkillTreeNode[] => {
    const result: SkillTreeNode[] = [];
    nodes.forEach((node) => {
      if (node.type === 'skill') result.push(node);
      if (node.children) result.push(...getAllSkills(node.children));
    });
    return result;
  };

  const allSkillNodes = getAllSkills(skillTree);
  const selectedSkill = selectedSkillId
    ? (allSkillNodes.find((skill) => skill.id === selectedSkillId) ?? null)
    : null;
  const activeSkills = allSkillNodes.filter((s) =>
    s.usedBy?.some((u) => u.status === 'active'),
  ).length;
  const assignedSkills = allSkillNodes.filter((s) => (s.usedBy?.length ?? 0) > 0).length;

  // Filter tree by search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return skillTree;
    const lower = searchQuery.toLowerCase();
    return skillTree
      .map((folder) => ({
        ...folder,
        children: folder.children?.filter(
          (child) =>
            child.name.toLowerCase().includes(lower) ||
            (child.description ?? '').toLowerCase().includes(lower),
        ),
      }))
      .filter((folder) => (folder.children?.length ?? 0) > 0);
  }, [skillTree, searchQuery]);

  return (
    <div className="h-full flex flex-col">
      {/* Hidden file input for import */}
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="application/json,.json"
        onChange={onFile}
      />

      {/* Compact Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Skills</h1>
              <p className="text-xs app-text-faint">Assignable catalog and AI Assistant bindings</p>
            </div>
            {/* Inline Metrics */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Package size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{skills.length}</span>
                <span className="app-text-faint">total</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Zap size={14} className="text-green-600" />
                <span className="font-semibold text-green-600">{activeSkills}</span>
                <span className="app-text-faint">active</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Users size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{assignedSkills}</span>
                <span className="app-text-faint">assigned</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {message?.tone === 'err' && (
              <span className="text-xs text-red-600 mr-2">{message.text}</span>
            )}
            {message?.tone === 'ok' && (
              <span className="text-xs text-green-600 mr-2">{message.text}</span>
            )}
            <Button
              variant={activeTab === 'assignments' ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => setActiveTab('assignments')}
            >
              <Users size={14} className="mr-1" />
              Assign to AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void handleReloadCatalog()}
              disabled={reloadingCatalog || loadState === 'loading'}
            >
              <RotateCcw size={14} className="mr-1" />
              {reloadingCatalog ? 'Reloading...' : 'Reload Catalog'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void handleExport()}
              disabled={exporting || loadState === 'loading'}
            >
              <Download size={14} className="mr-1" />
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={onPickFile}>
              <Upload size={14} className="mr-1" />
              Import
            </Button>
            {preview && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-red-600 border-red-600"
                onClick={() => void applyImport()}
                disabled={importing}
              >
                {importing ? 'Applying...' : 'Apply Import'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Top-level tab switcher */}
      <div className="border-b app-border-subtle px-6 pt-2 app-surface-strong">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'catalog' | 'assignments' | 'library')}>
          <TabsList className="h-9">
            <TabsTrigger value="catalog" className="text-xs">Assignable Catalog</TabsTrigger>
            <TabsTrigger value="assignments" className="text-xs">AI Assistant Assignments</TabsTrigger>
            <TabsTrigger value="library" className="text-xs">AEL Definitions</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'library' && <AelSkillDefinitionsTab />}
        {activeTab === 'assignments' && (
          <SkillAssignmentsTab
            skills={skills}
            assistants={assistantMembers}
            bindings={skillBindings}
            loading={assignmentState === 'loading'}
            onReload={loadAssignments}
          />
        )}
        {activeTab === 'catalog' && (
        <>
        {/* Left Sidebar - Tree */}
        <div className="w-[320px] app-surface-strong border-r app-border-subtle flex flex-col">
          {/* Search */}
          <div className="p-4 border-b app-border-subtle">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint"
              />
              <Input
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* Tree */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {loadState === 'loading' && skills.length === 0 ? (
                <div className="text-center py-8 app-text-faint text-sm">Loading skills...</div>
              ) : loadState === 'error' ? (
                <div className="text-center py-8 text-red-600 text-sm">Failed to load skills</div>
              ) : (
                filteredTree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    onSelectSkill={(skill) => setSelectedSkillId(skill.id)}
                    selectedSkillId={selectedSkillId}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content - Skill Details */}
        <div className="flex-1 overflow-auto">
          {selectedSkill ? (
            <div className="p-6 max-w-5xl mx-auto">
              {/* Skill Header */}
              <div className="mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold">
                      <Code size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold app-text-strong mb-1">
                        {selectedSkill.name}
                      </h2>
                      <p className="text-sm app-text-muted mb-2">{selectedSkill.description}</p>
                      <div className="flex items-center gap-2">
                        {selectedSkill.category && (
                          <Badge variant="outline" className="text-xs">
                            {selectedSkill.category}
                          </Badge>
                        )}
                        {selectedSkill.version && (
                          <Badge variant="outline" className="text-xs">
                            v{selectedSkill.version}
                          </Badge>
                        )}
                        {selectedSkill.language && (
                          <Badge variant="outline" className="text-xs">
                            {selectedSkill.language}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('assignments')}>
                    <Users size={14} className="mr-1" />
                    Manage Assignments
                  </Button>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="app-accent-text" />
                      <span className="text-xs app-text-faint">Assigned To</span>
                    </div>
                    <div className="text-2xl font-bold app-text-strong">
                      {selectedSkill.usedBy?.length ?? 0}
                    </div>
                    <div className="text-xs app-text-faint">AI Assistants</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package size={16} className="app-text-muted" />
                      <span className="text-xs app-text-faint">Category</span>
                    </div>
                    <div className="text-sm font-semibold app-text-strong">
                      {selectedSkill.category ?? 'other'}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal size={16} className="app-text-muted" />
                      <span className="text-xs app-text-faint">Source</span>
                    </div>
                    <div className="text-sm font-semibold app-text-strong truncate">
                      {selectedSkill.path ? 'Markdown file' : 'Catalog entry'}
                    </div>
                  </Card>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="agents" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="agents">Agents Using This</TabsTrigger>
                  <TabsTrigger value="code">Source Code</TabsTrigger>
                </TabsList>

                {/* Agents Tab */}
                <TabsContent value="agents" className="space-y-3">
                  {selectedSkill.usedBy && selectedSkill.usedBy.length > 0 ? (
                    selectedSkill.usedBy.map((usage) => (
                      <Card key={usage.agentId} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <PixelAvatar name={usage.agentName} size="md" />
                            <div>
                              <div className="font-semibold app-text-strong mb-1">
                                {usage.agentName}
                              </div>
                              <div className="flex items-center gap-3 text-xs app-text-faint">
                                <div className="flex items-center gap-1">
                                  <StatusDot
                                    status={
                                      usage.status === 'active'
                                        ? 'success'
                                        : usage.status === 'error'
                                          ? 'error'
                                          : 'idle'
                                    }
                                  />
                                  <span className="capitalize">{usage.status}</span>
                                </div>
                                <span>-</span>
                                <div className="flex items-center gap-1">
                                  <Clock size={12} />
                                  Last used {usage.lastUsed}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <Card className="p-8 text-center">
                      <Users size={32} className="app-text-faint mx-auto mb-2" />
                      <p className="text-sm app-text-faint">No agents using this skill yet</p>
                    </Card>
                  )}
                </TabsContent>

                {/* Code Tab */}
                <TabsContent value="code">
                  <Card className="p-0 overflow-hidden">
                    <div className="app-surface-strong border-b app-border-subtle px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs app-text-faint">
                        <Terminal size={14} />
                        <span className="font-mono">
                          {selectedSkill.path || `${selectedSkill.name}.md`}
                        </span>
                      </div>
                    </div>
                    <pre className="p-4 text-xs font-mono app-text-strong overflow-x-auto bg-gray-50 dark:bg-gray-900/50">
                      {selectedSkill.code ??
                        `# ${selectedSkill.name}\n\n${selectedSkill.description ?? 'No source code available'}`}
                    </pre>
                  </Card>
                </TabsContent>

              </Tabs>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <FileCode size={48} className="app-text-faint mx-auto mb-4" />
                <h3 className="text-lg font-semibold app-text-strong mb-2">
                  Select a skill to view details
                </h3>
                <p className="text-sm app-text-muted">
                  Choose a skill from the tree on the left to see its details and usage
                </p>
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};
