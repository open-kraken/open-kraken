/**
 * SkillsPage -- tree-based skill catalog with detail panel.
 * Keeps existing API calls (getSkills, getMemberSkills, updateMemberSkills)
 * and export/import snapshot functionality.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Eye,
  Edit,
  Copy,
  MoreVertical,
  FilePlus,
  FolderPlus,
  Move,
  Archive,
  Trash2,
  Terminal,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { appEnv } from '@/config/env';
import { getSkills, getMemberSkills, updateMemberSkills } from '@/api/skills';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PixelAvatar } from '@/components/ui/pixel-avatar';
import { StatusDot } from '@/components/ui/status-dot';

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

function buildTreeFromSkills(skills: Skill[]): SkillTreeNode[] {
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
        usedBy: [],
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
  const [isHovered, setIsHovered] = useState(false);

  const isFolder = node.type === 'folder';
  const isSelected = selectedSkillId === node.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:app-surface-strong transition-colors ${
          isSelected ? 'app-surface-strong' : ''
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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

        {!isFolder && node.usedBy && node.usedBy.length > 0 && !isHovered && (
          <Badge variant="outline" className="text-[10px] h-5 shrink-0">
            {node.usedBy.length}
          </Badge>
        )}

        {/* Action Buttons (show on hover) */}
        {isHovered && (
          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {isFolder && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Plus size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>
                    <FilePlus size={14} className="mr-2" />
                    New Skill
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <FolderPlus size={14} className="mr-2" />
                    New Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <Edit size={14} className="mr-2" />
                  Rename
                </DropdownMenuItem>
                {!isFolder && (
                  <>
                    <DropdownMenuItem>
                      <Copy size={14} className="mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Eye size={14} className="mr-2" />
                      Preview
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem>
                  <Move size={14} className="mr-2" />
                  Move to...
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isFolder && (
                  <DropdownMenuItem>
                    <Archive size={14} className="mr-2" />
                    Archive Folder
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-red-600">
                  <Trash2 size={14} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

/* ── Page component ── */

export const SkillsPage = () => {
  const { t } = useI18n();
  const { apiClient } = useAppShell();
  const fileRef = useRef<HTMLInputElement>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<SkillsSnapshotV1 | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillTreeNode | null>(null);
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
      }
    } finally {
      setImporting(false);
    }
  }, [preview, loadCatalog, t]);

  const skillTree = useMemo(() => buildTreeFromSkills(skills), [skills]);

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
  const activeSkills = allSkillNodes.filter((s) =>
    s.usedBy?.some((u) => u.status === 'active'),
  ).length;

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
            <Button size="sm" className="h-8">
              <Plus size={14} className="mr-1" />
              New Skill
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
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
                    onSelectSkill={setSelectedSkill}
                    selectedSkillId={selectedSkill?.id ?? null}
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
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Eye size={14} className="mr-1" />
                      Preview
                    </Button>
                    <Button variant="outline" size="sm">
                      <Edit size={14} className="mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm">
                      <Copy size={14} className="mr-1" />
                      Duplicate
                    </Button>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="app-accent-text" />
                      <span className="text-xs app-text-faint">Used By</span>
                    </div>
                    <div className="text-2xl font-bold app-text-strong">
                      {selectedSkill.usedBy?.length ?? 0}
                    </div>
                    <div className="text-xs app-text-faint">agents</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity size={16} className="text-green-600" />
                      <span className="text-xs app-text-faint">Total Calls</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {selectedSkill.usedBy?.reduce((sum, u) => sum + u.usageCount, 0) ?? 0}
                    </div>
                    <div className="text-xs app-text-faint">executions</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="app-text-muted" />
                      <span className="text-xs app-text-faint">Last Used</span>
                    </div>
                    <div className="text-sm font-semibold app-text-strong">
                      {selectedSkill.usedBy?.[0]?.lastUsed ?? 'Never'}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package size={16} className="app-text-muted" />
                      <span className="text-xs app-text-faint">Dependencies</span>
                    </div>
                    <div className="text-2xl font-bold app-text-strong">
                      {selectedSkill.dependencies?.length ?? 0}
                    </div>
                  </Card>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="agents" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="agents">Agents Using This</TabsTrigger>
                  <TabsTrigger value="code">Source Code</TabsTrigger>
                  <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                  <TabsTrigger value="activity">Activity Log</TabsTrigger>
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
                          <div className="text-right">
                            <div className="text-2xl font-bold app-accent-text">
                              {usage.usageCount.toLocaleString()}
                            </div>
                            <div className="text-xs app-text-faint">total calls</div>
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
                      <Button variant="ghost" size="sm" className="h-7">
                        <Copy size={12} className="mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="p-4 text-xs font-mono app-text-strong overflow-x-auto bg-gray-50 dark:bg-gray-900/50">
                      {selectedSkill.code ??
                        `# ${selectedSkill.name}\n\n${selectedSkill.description ?? 'No source code available'}`}
                    </pre>
                  </Card>
                </TabsContent>

                {/* Dependencies Tab */}
                <TabsContent value="dependencies">
                  <Card className="p-4">
                    {selectedSkill.dependencies && selectedSkill.dependencies.length > 0 ? (
                      <div className="space-y-2">
                        {selectedSkill.dependencies.map((dep, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 py-2 px-3 rounded app-surface-strong"
                          >
                            <Package size={14} className="app-accent-text" />
                            <span className="font-mono text-sm app-text-strong">{dep}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Package size={32} className="app-text-faint mx-auto mb-2" />
                        <p className="text-sm app-text-faint">No dependencies</p>
                      </div>
                    )}
                  </Card>
                </TabsContent>

                {/* Activity Tab */}
                <TabsContent value="activity">
                  <div className="space-y-3">
                    <Card className="p-8 text-center">
                      <Activity size={32} className="app-text-faint mx-auto mb-2" />
                      <p className="text-sm app-text-faint">
                        No activity recorded for this skill yet
                      </p>
                    </Card>
                  </div>
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
      </div>
    </div>
  );
};
