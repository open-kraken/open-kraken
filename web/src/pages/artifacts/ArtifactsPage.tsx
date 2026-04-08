import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';

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

export const ArtifactsPage = () => {
  const [filter, setFilter] = useState<ArtifactType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ArtifactStatus | 'all'>('all');

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
          <Button className="app-accent-bg hover:opacity-90 text-white">
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
                    <Button variant="outline" size="sm" className="flex-1">
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
    </div>
  );
};
