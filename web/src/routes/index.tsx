export type AppRouteId =
  | 'dashboard'
  | 'ledger'
  | 'chat'
  | 'members'
  | 'skills'
  | 'taskmap'
  | 'roadmap'
  | 'terminal'
  | 'nodes'
  | 'approvals'
  | 'workspaces'
  | 'repositories'
  | 'namespaces'
  | 'artifacts'
  | 'system'
  | 'settings'
  | 'plugins'
  | 'account';

export type AppRouteDefinition = {
  id: AppRouteId;
  path: `/${string}`;
  label: string;
  description: string;
};

export const appRoutes: AppRouteDefinition[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    description: 'Operations monitoring and platform health.'
  },
  {
    id: 'ledger',
    path: '/ledger',
    label: 'Ledger',
    description: 'Central audit trail: teams, members, commands, and context for retrospectives.'
  },
  {
    id: 'chat',
    path: '/chat',
    label: 'Chat',
    description: 'Workspace conversations across humans and connected agents.'
  },
  {
    id: 'members',
    path: '/members',
    label: 'Team',
    description: 'Roster, roles, presence, and per-member terminal posture.'
  },
  {
    id: 'skills',
    path: '/skills',
    label: 'Skills',
    description: 'Skill catalog, export/import snapshots, and binding backup.'
  },
  {
    id: 'taskmap',
    path: '/taskmap',
    label: 'Task Map',
    description: 'Dependency graph for work items, execution paths, and blockers.'
  },
  {
    id: 'roadmap',
    path: '/roadmap',
    label: 'Observability',
    description: 'Roadmap and execution observability across squads and milestones.'
  },
  {
    id: 'terminal',
    path: '/terminal',
    label: 'Sessions',
    description: 'Attach to agent PTY streams (snapshot / delta / status).'
  },
  {
    id: 'nodes',
    path: '/nodes',
    label: 'Nodes',
    description: 'Execution node topology, status, and agent assignment.'
  },
  {
    id: 'approvals',
    path: '/approvals',
    label: 'Approvals',
    description: 'Review gated actions, escalation requests, and pending approvals.'
  },
  {
    id: 'workspaces',
    path: '/workspaces',
    label: 'Workspaces',
    description: 'Workspace registry, ownership, and current activity.'
  },
  {
    id: 'repositories',
    path: '/repositories',
    label: 'Repositories',
    description: 'Connected repositories, branch posture, and sync health.'
  },
  {
    id: 'namespaces',
    path: '/namespaces',
    label: 'Namespaces',
    description: 'Namespace inventory, tenancy boundaries, and membership.'
  },
  {
    id: 'artifacts',
    path: '/artifacts',
    label: 'Artifacts',
    description: 'Build outputs, bundles, and delivery artifacts across runs.'
  },
  {
    id: 'system',
    path: '/system',
    label: 'System',
    description: 'Health probes, stream posture, and observability baselines.'
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    description: 'Workspace defaults, guards, and shell integration checks.'
  },
  {
    id: 'plugins',
    path: '/plugins',
    label: 'Plugins',
    description: 'Browse, install, and manage workspace plugins and extensions.'
  },
  {
    id: 'account',
    path: '/account',
    label: 'Account',
    description: 'Profile, role, connected providers, and personal preferences.'
  }
];

export type AppNavGroup = {
  id: 'observability' | 'collaboration' | 'delivery' | 'runtime' | 'development' | 'workspace';
  label: string;
  routeIds: AppRouteId[];
};

export const appNavGroups: AppNavGroup[] = [
  { id: 'observability', label: 'Observability', routeIds: ['dashboard', 'ledger'] },
  { id: 'collaboration', label: 'Collaboration', routeIds: ['chat', 'members', 'skills'] },
  { id: 'delivery', label: 'Delivery', routeIds: ['taskmap', 'roadmap'] },
  { id: 'runtime', label: 'Runtime & nodes', routeIds: ['terminal', 'nodes', 'approvals'] },
  { id: 'development', label: 'Development', routeIds: ['workspaces', 'repositories'] },
  { id: 'workspace', label: 'Workspace & ops', routeIds: ['namespaces', 'artifacts', 'system', 'settings', 'plugins'] }
];

const routeMap = new Map<string, AppRouteDefinition>(appRoutes.map((route) => [route.path, route]));

export const defaultRoute = appRoutes.find((route) => route.id === 'chat') ?? appRoutes[0];

export const resolveAppRoute = (pathname: string) => {
  return routeMap.get(pathname) ?? defaultRoute;
};
