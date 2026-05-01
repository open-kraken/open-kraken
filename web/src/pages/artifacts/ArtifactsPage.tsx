import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  FileCode,
  Download,
  Eye,
  Star,
  GitCommit,
  CheckCircle,
  Clock,
  Filter,
  Copy,
  Archive,
} from 'lucide-react';
import { PreviewRouteNotice } from '@/components/shell/PreviewRouteNotice';

type ArtifactType = 'report' | 'patch' | 'plan' | 'test_result' | 'export' | 'doc';
type ArtifactStatus = 'draft' | 'final' | 'archived';

interface Artifact {
  id: string;
  type: ArtifactType;
  status: ArtifactStatus;
  name: string;
  description: string;
  agent: string;
  team: string;
  task?: string;
  createdAt: string;
  size: string;
  version: number;
  isFinal: boolean;
  linkedTo?: {
    pr?: string;
    commit?: string;
    trace?: string;
  };
}

const mockArtifacts: Artifact[] = [
  {
    id: 'art_001',
    type: 'report',
    status: 'final',
    name: 'Code Review Summary - auth.ts',
    description: 'Comprehensive security review of authentication module',
    agent: 'Claude BE',
    team: 'Backend Squad',
    task: 'task_142',
    createdAt: '2h ago',
    size: '24 KB',
    version: 2,
    isFinal: true,
    linkedTo: { pr: '#342', trace: 'trace_142_1' },
  },
  {
    id: 'art_002',
    type: 'patch',
    status: 'final',
    name: 'Dashboard UI Redesign Patch',
    description: 'Complete patch set for dashboard metrics redesign',
    agent: 'Gemini FE',
    team: 'Frontend Squad',
    task: 'task_143',
    createdAt: '4h ago',
    size: '156 KB',
    version: 3,
    isFinal: true,
    linkedTo: { commit: 'c8d4f12', pr: '#345', trace: 'trace_143_1' },
  },
  {
    id: 'art_003',
    type: 'test_result',
    status: 'final',
    name: 'Integration Test Results - v2.1.4',
    description: 'Full integration test suite results for release candidate',
    agent: 'Gemini QA',
    team: 'Workspace Team',
    task: 'task_140',
    createdAt: '6h ago',
    size: '892 KB',
    version: 1,
    isFinal: false,
    linkedTo: { trace: 'trace_140_1' },
  },
  {
    id: 'art_004',
    type: 'plan',
    status: 'draft',
    name: 'Microservices Migration Plan',
    description: 'Detailed execution plan for migrating monolith to microservices',
    agent: 'Claude Code',
    team: 'Backend Squad',
    createdAt: '1d ago',
    size: '48 KB',
    version: 1,
    isFinal: false,
  },
  {
    id: 'art_005',
    type: 'doc',
    status: 'final',
    name: 'API Documentation v2.1',
    description: 'Auto-generated API documentation from code comments',
    agent: 'Codex DevOps',
    team: 'Workspace Team',
    task: 'task_138',
    createdAt: '2d ago',
    size: '2.4 MB',
    version: 5,
    isFinal: true,
    linkedTo: { commit: 'f7a3b92' },
  },
  {
    id: 'art_006',
    type: 'export',
    status: 'final',
    name: 'Weekly Token Usage Report',
    description: 'Comprehensive token usage and cost analysis for the week',
    agent: 'System',
    team: 'Workspace Team',
    createdAt: '3d ago',
    size: '128 KB',
    version: 1,
    isFinal: true,
  },
];

const getTypeIcon = (type: ArtifactType) => {
  switch (type) {
    case 'report':
      return <FileText size={16} />;
    case 'patch':
      return <FileCode size={16} />;
    case 'plan':
      return <FileText size={16} />;
    case 'test_result':
      return <CheckCircle size={16} />;
    case 'export':
      return <Download size={16} />;
    case 'doc':
      return <FileText size={16} />;
  }
};

const getTypeBadgeColor = (type: ArtifactType) => {
  switch (type) {
    case 'report':
      return 'text-blue-600 border-blue-600';
    case 'patch':
      return 'text-purple-600 border-purple-600';
    case 'plan':
      return 'text-cyan-600 border-cyan-600';
    case 'test_result':
      return 'text-green-600 border-green-600';
    case 'export':
      return 'text-orange-600 border-orange-600';
    case 'doc':
      return 'text-gray-600 border-gray-600';
  }
};

const contentPreviews: Record<string, string> = {
  report: `# Code Review Summary - auth.ts

## Security Analysis

### Critical Findings
1. \u2713 Password hashing using bcrypt with appropriate salt rounds
2. \u2713 JWT tokens properly signed and validated
3. \u26a0 Session timeout could be reduced from 24h to 8h

### Recommendations
- Implement rate limiting on login endpoint
- Add 2FA support for admin accounts
- Consider implementing refresh tokens

### Code Quality: 9/10`,
  patch: `diff --git a/src/dashboard/metrics.tsx b/src/dashboard/metrics.tsx
--- a/src/dashboard/metrics.tsx
+++ b/src/dashboard/metrics.tsx
@@ -45,7 +45,12 @@
-  return <div className="metrics">
+  return <div className="metrics-v2">
+    <MetricCard
+      title="Active Users"
+      value={stats.activeUsers}
+      trend={+12.3}
+    />
   </div>`,
  test_result: `Test Results Summary
====================
Total Tests: 127
Passed: 124 \u2713
Failed: 2 \u2717
Skipped: 1 \u25cb

Coverage: 89.4%
Duration: 2m 14s

Failed Tests:
1. auth.test.ts - Token expiry edge case
2. api.test.ts - Rate limit boundary check`,
  plan: `# Microservices Migration Plan

## Phase 1: Analysis (2 weeks)
- Identify service boundaries
- Map dependencies
- Document APIs

## Phase 2: Setup (1 week)
- Configure infrastructure
- Set up monitoring
- Prepare CI/CD pipelines

## Phase 3: Migration (6 weeks)
- Extract user service
- Extract auth service
- Extract payment service

## Risks & Mitigation
- Data consistency \u2192 Event sourcing
- Service communication \u2192 Circuit breakers`,
};

export const ArtifactsPage = () => {
  const [filter, setFilter] = useState<ArtifactType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ArtifactStatus | 'all'>('all');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  let filteredArtifacts =
    filter === 'all' ? mockArtifacts : mockArtifacts.filter((a) => a.type === filter);
  filteredArtifacts =
    statusFilter === 'all'
      ? filteredArtifacts
      : filteredArtifacts.filter((a) => a.status === statusFilter);

  const finalCount = mockArtifacts.filter((a) => a.isFinal).length;
  const draftCount = mockArtifacts.filter((a) => a.status === 'draft').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold app-text-strong">Artifacts</h1>
            <p className="text-sm app-text-muted mt-1">
              Browse generated reports, patches, plans, and outputs
            </p>
          </div>
          <Button className="app-accent-bg hover:opacity-90 text-white" disabled title="Preview data only">
            <Download size={14} className="mr-1" />
            Export All
          </Button>
        </div>

        {/* Metrics */}
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="app-text-faint">Total:</span>
            <span className="app-text-strong font-medium">{mockArtifacts.length}</span>
          </div>
          <span className="text-gray-300">&bull;</span>
          <div className="flex items-center gap-2">
            <Star size={14} className="text-yellow-600" />
            <span className="app-text-faint">Final:</span>
            <span className="app-text-strong font-medium">{finalCount}</span>
          </div>
          <span className="text-gray-300">&bull;</span>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-600" />
            <span className="app-text-faint">Draft:</span>
            <span className="app-text-strong font-medium">{draftCount}</span>
          </div>
        </div>
      </div>

      <PreviewRouteNotice surface="Artifacts" dependency="artifact storage and index APIs" />

      {/* Filters */}
      <div className="app-bg-elevated border-b app-border-subtle px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter size={14} className="app-text-faint" />
            <span className="text-xs app-text-faint font-medium">Type:</span>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as ArtifactType | 'all')}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="report">Reports</TabsTrigger>
              <TabsTrigger value="patch">Patches</TabsTrigger>
              <TabsTrigger value="plan">Plans</TabsTrigger>
              <TabsTrigger value="test_result">Tests</TabsTrigger>
              <TabsTrigger value="doc">Docs</TabsTrigger>
              <TabsTrigger value="export">Exports</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-4 flex items-center gap-2">
            <span className="text-xs app-text-faint font-medium">Status:</span>
          </div>
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as ArtifactStatus | 'all')}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="final">Final</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Artifacts Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {filteredArtifacts.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto app-text-faint mb-3" />
              <h3 className="font-semibold app-text-strong mb-1">No artifacts</h3>
              <p className="text-sm app-text-muted">No artifacts match your filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArtifacts.map((artifact) => (
                <Card
                  key={artifact.id}
                  className="p-4 cursor-pointer hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center app-text-muted">
                      {getTypeIcon(artifact.type)}
                    </div>
                    <div className="flex items-center gap-2">
                      {artifact.isFinal && (
                        <Star size={14} className="text-yellow-600 fill-yellow-600" />
                      )}
                      {artifact.status === 'draft' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-gray-600 border-gray-600"
                        >
                          Draft
                        </Badge>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-sm app-text-strong mb-1 line-clamp-2">
                    {artifact.name}
                  </h3>
                  <p className="text-xs app-text-muted mb-3 line-clamp-2">
                    {artifact.description}
                  </p>

                  <div className="flex items-center gap-2 mb-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${getTypeBadgeColor(artifact.type)}`}
                    >
                      {artifact.type.replace('_', ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      v{artifact.version}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs mb-3">
                    <div>
                      <span className="app-text-faint">Agent:</span>{' '}
                      <span className="app-text-strong">{artifact.agent}</span>
                    </div>
                    <div>
                      <span className="app-text-faint">Team:</span>{' '}
                      <span className="app-text-strong">{artifact.team}</span>
                    </div>
                    <div>
                      <span className="app-text-faint">Created:</span>{' '}
                      <span className="app-text-strong">{artifact.createdAt}</span>
                    </div>
                    <div>
                      <span className="app-text-faint">Size:</span>{' '}
                      <span className="app-text-strong">{artifact.size}</span>
                    </div>
                  </div>

                  {/* Linked Resources */}
                  {artifact.linkedTo && (
                    <div className="border-t app-border-subtle pt-3 mb-3">
                      <div className="text-[10px] app-text-faint mb-1">Linked to:</div>
                      <div className="flex flex-wrap gap-1">
                        {artifact.linkedTo.pr && (
                          <Badge variant="outline" className="text-[10px]">
                            PR {artifact.linkedTo.pr}
                          </Badge>
                        )}
                        {artifact.linkedTo.commit && (
                          <Badge variant="outline" className="text-[10px]">
                            <GitCommit size={8} className="mr-1" />
                            {artifact.linkedTo.commit}
                          </Badge>
                        )}
                        {artifact.linkedTo.trace && (
                          <Badge variant="outline" className="text-[10px]">
                            Trace
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedArtifact(artifact)}
                    >
                      <Eye size={14} className="mr-1" />
                      View
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Download size={14} className="mr-1" />
                      Download
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Artifact Detail Dialog */}
      <Dialog open={!!selectedArtifact} onOpenChange={(open) => !open && setSelectedArtifact(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedArtifact && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center app-text-muted">
                    {getTypeIcon(selectedArtifact.type)}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-xl">{selectedArtifact.name}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {selectedArtifact.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-2">
                      Type &amp; Status
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className={getTypeBadgeColor(selectedArtifact.type)}>
                        {selectedArtifact.type.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        v{selectedArtifact.version}
                      </Badge>
                      {selectedArtifact.isFinal && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                          <Star size={10} className="mr-1 fill-yellow-600" />
                          Final
                        </Badge>
                      )}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-2">
                      Created By
                    </div>
                    <div className="text-sm app-text-strong">{selectedArtifact.agent}</div>
                    <div className="text-xs app-text-muted">{selectedArtifact.team}</div>
                  </Card>

                  <Card className="p-4">
                    <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-2">
                      Created
                    </div>
                    <div className="text-sm app-text-strong">{selectedArtifact.createdAt}</div>
                  </Card>

                  <Card className="p-4">
                    <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-2">
                      Size
                    </div>
                    <div className="text-sm app-text-strong">{selectedArtifact.size}</div>
                  </Card>
                </div>

                {/* Linked Resources */}
                {(selectedArtifact.linkedTo || selectedArtifact.task) && (
                  <Card className="p-4">
                    <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                      Linked Resources
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedArtifact.linkedTo?.pr && (
                        <Badge variant="outline" className="text-xs">
                          Pull Request {selectedArtifact.linkedTo.pr}
                        </Badge>
                      )}
                      {selectedArtifact.linkedTo?.commit && (
                        <Badge variant="outline" className="text-xs">
                          <GitCommit size={10} className="mr-1" />
                          Commit {selectedArtifact.linkedTo.commit}
                        </Badge>
                      )}
                      {selectedArtifact.linkedTo?.trace && (
                        <Badge variant="outline" className="text-xs">
                          Trace {selectedArtifact.linkedTo.trace}
                        </Badge>
                      )}
                      {selectedArtifact.task && (
                        <Badge variant="outline" className="text-xs">
                          Task {selectedArtifact.task}
                        </Badge>
                      )}
                    </div>
                  </Card>
                )}

                {/* Content Preview */}
                <Card className="p-4">
                  <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                    Content Preview
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 font-mono text-xs app-text-strong">
                    {contentPreviews[selectedArtifact.type] ? (
                      <pre className="whitespace-pre-wrap">
                        {contentPreviews[selectedArtifact.type]}
                      </pre>
                    ) : (
                      <div className="text-center py-8 app-text-muted">
                        <FileText size={32} className="mx-auto mb-2" />
                        <div>Full content available after download</div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-4 border-t app-border-subtle">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(`https://kraken.io/artifacts/${selectedArtifact.id}`);
                  }}
                >
                  <Copy size={14} className="mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedArtifact(null)}
                >
                  <Archive size={14} className="mr-2" />
                  Archive
                </Button>
                <Button
                  className="app-accent-bg hover:opacity-90 text-white"
                  onClick={() => setSelectedArtifact(null)}
                >
                  <Download size={14} className="mr-2" />
                  Download
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
