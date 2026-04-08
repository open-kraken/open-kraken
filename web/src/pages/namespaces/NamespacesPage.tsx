import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2,
  Search,
  Plus,
  Settings,
  MoreVertical,
  Users,
  Briefcase,
  Calendar,
  Archive,
  ExternalLink,
  Edit,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { PixelAvatar } from '@/components/ui/pixel-avatar';

type NamespaceStatus = 'active' | 'archived';

interface Namespace {
  id: string;
  name: string;
  description: string;
  status: NamespaceStatus;
  teamCount: number;
  memberCount: number;
  createdAt: string;
}

const mockWorkspaces: Namespace[] = [
  {
    id: 'ns_001',
    name: 'Open Kraken',
    description: 'Primary production-facing development space for the Kraken platform',
    status: 'active',
    teamCount: 4,
    memberCount: 12,
    createdAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'ns_002',
    name: 'Demo Project',
    description: 'Demo sandbox for product walkthroughs and customer presentations',
    status: 'active',
    teamCount: 2,
    memberCount: 5,
    createdAt: '2025-03-01T00:00:00Z',
  },
  {
    id: 'ns_003',
    name: 'Staging',
    description: 'Pre-release validation namespace for integration testing',
    status: 'active',
    teamCount: 3,
    memberCount: 8,
    createdAt: '2025-02-10T00:00:00Z',
  },
  {
    id: 'ns_004',
    name: 'Legacy Platform',
    description: 'Archived namespace from previous platform iteration',
    status: 'archived',
    teamCount: 1,
    memberCount: 0,
    createdAt: '2024-06-20T00:00:00Z',
  },
];

export const NamespacesPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'archived'>('all');

  const filteredNamespaces = mockWorkspaces.filter((ns) => {
    const matchesSearch =
      ns.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ns.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || ns.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const activeCount = mockWorkspaces.filter((ns) => ns.status === 'active').length;
  const archivedCount = mockWorkspaces.filter((ns) => ns.status === 'archived').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold app-text-strong">Namespaces</h1>
            <p className="text-sm app-text-muted mt-1">
              Manage your organization's namespaces and team workspaces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Settings size={14} className="mr-1" />
              Settings
            </Button>
            <Button size="sm">
              <Plus size={14} className="mr-1" />
              New Namespace
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint" />
            <Input
              placeholder="Search namespaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('all')}
            >
              All ({mockWorkspaces.length})
            </Button>
            <Button
              variant={filterStatus === 'active' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('active')}
            >
              Active ({activeCount})
            </Button>
            <Button
              variant={filterStatus === 'archived' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('archived')}
            >
              Archived ({archivedCount})
            </Button>
          </div>
        </div>
      </div>

      {/* Namespace Grid */}
      <ScrollArea className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredNamespaces.map((namespace) => (
            <Card key={namespace.id} className="p-5 hover:app-surface-hover transition-colors">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {namespace.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold app-text-strong truncate">
                        {namespace.name}
                      </h3>
                      {namespace.status === 'active' ? (
                        <Badge
                          variant="outline"
                          className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                        >
                          <CheckCircle size={10} className="mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Archive size={10} className="mr-1" />
                          Archived
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs app-text-muted line-clamp-2">
                      {namespace.description}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                      <MoreVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <ExternalLink size={14} className="mr-2" />
                      Open Namespace
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Edit size={14} className="mr-2" />
                      Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings size={14} className="mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {namespace.status === 'active' ? (
                      <DropdownMenuItem>
                        <Archive size={14} className="mr-2" />
                        Archive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem>
                        <CheckCircle size={14} className="mr-2" />
                        Restore
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 size={14} className="mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 rounded app-surface-strong">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Briefcase size={12} className="app-text-muted" />
                  </div>
                  <div className="text-lg font-bold app-text-strong">{namespace.teamCount}</div>
                  <div className="text-[10px] app-text-faint">Teams</div>
                </div>
                <div className="text-center p-2 rounded app-surface-strong">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Users size={12} className="app-text-muted" />
                  </div>
                  <div className="text-lg font-bold app-text-strong">{namespace.memberCount}</div>
                  <div className="text-[10px] app-text-faint">Members</div>
                </div>
                <div className="text-center p-2 rounded app-surface-strong">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Calendar size={12} className="app-text-muted" />
                  </div>
                  <div className="text-[10px] font-mono app-text-strong">
                    {new Date(namespace.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                  <div className="text-[10px] app-text-faint">Created</div>
                </div>
              </div>

              {/* Team Preview */}
              <div className="border-t app-border-subtle pt-3">
                <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider mb-2">
                  Teams
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {['Frontend Squad', 'Backend Squad', 'Design Team']
                      .slice(0, namespace.teamCount)
                      .map((team, idx) => (
                        <PixelAvatar
                          key={idx}
                          name={team}
                          size="sm"
                          className="ring-2 ring-white dark:ring-gray-800"
                        />
                      ))}
                  </div>
                  {namespace.teamCount > 3 && (
                    <span className="text-xs app-text-faint">+{namespace.teamCount - 3} more</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 pt-3 border-t app-border-subtle flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings size={12} className="mr-1" />
                  Manage
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Users size={12} className="mr-1" />
                  Members
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredNamespaces.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Building2 size={48} className="app-text-faint mb-4" />
            <h3 className="text-lg font-semibold app-text-strong mb-2">No namespaces found</h3>
            <p className="text-sm app-text-muted mb-4">
              {searchQuery
                ? 'Try adjusting your search or filters'
                : 'Get started by creating your first namespace'}
            </p>
            {!searchQuery && (
              <Button>
                <Plus size={14} className="mr-1" />
                Create Namespace
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
