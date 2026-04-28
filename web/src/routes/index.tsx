export type AppRouteId =
  | 'dashboard'
  | 'ledger'
  | 'runs'
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

export type AppRole = 'owner' | 'supervisor' | 'assistant' | 'member';

export type AppRouteDefinition = {
  id: AppRouteId;
  path: `/${string}`;
  label: string;
  description: string;
  allowedRoles?: AppRole[];
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
    description: 'Central audit trail: teams, members, commands, and context for retrospectives.',
    allowedRoles: ['owner', 'supervisor', 'assistant']
  },
  {
    id: 'runs',
    path: '/runs',
    label: 'Runs',
    description: 'AEL execution runs — monitor flows, steps, and token usage in real time.',
    allowedRoles: ['owner', 'supervisor', 'assistant']
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
    description: 'Skill catalog, export/import snapshots, and binding backup.',
    allowedRoles: ['owner', 'supervisor', 'assistant']
  },
  {
    id: 'taskmap',
    path: '/taskmap',
    label: 'Task Map',
    description: 'Dependency graph for work items, execution paths, and blockers.',
    allowedRoles: ['owner', 'supervisor', 'assistant']
  },
  {
    id: 'roadmap',
    path: '/roadmap',
    label: 'Roadmap',
    description: 'Compatibility route for the merged Task Map and roadmap view.',
    allowedRoles: ['owner', 'supervisor', 'assistant']
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
    description: 'Execution node topology, status, and agent assignment.',
    allowedRoles: ['owner', 'supervisor', 'assistant']
  },
  {
    id: 'approvals',
    path: '/approvals',
    label: 'Approvals',
    description: 'Review gated actions, escalation requests, and pending approvals.',
    allowedRoles: ['owner', 'supervisor']
  },
  {
    id: 'workspaces',
    path: '/workspaces',
    label: 'Workspaces',
    description: 'Workspace registry, ownership, and current activity.',
    allowedRoles: ['owner', 'supervisor']
  },
  {
    id: 'repositories',
    path: '/repositories',
    label: 'Repositories',
    description: 'Connected repositories, branch posture, and sync health.',
    allowedRoles: ['owner', 'supervisor']
  },
  {
    id: 'namespaces',
    path: '/namespaces',
    label: 'Namespaces',
    description: 'Namespace inventory, tenancy boundaries, and membership.',
    allowedRoles: ['owner', 'supervisor']
  },
  {
    id: 'artifacts',
    path: '/artifacts',
    label: 'Artifacts',
    description: 'Build outputs, bundles, and delivery artifacts across runs.',
    allowedRoles: ['owner', 'supervisor']
  },
  {
    id: 'system',
    path: '/system',
    label: 'System',
    description: 'Health probes, stream posture, and observability baselines.',
    allowedRoles: ['owner', 'supervisor']
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
    description: 'Browse, install, and manage workspace plugins and extensions.',
    allowedRoles: ['owner', 'supervisor']
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
  { id: 'observability', label: 'Observability', routeIds: ['dashboard', 'ledger', 'runs'] },
  { id: 'collaboration', label: 'Collaboration', routeIds: ['chat', 'members', 'skills'] },
  { id: 'delivery', label: 'Delivery', routeIds: ['taskmap'] },
  { id: 'runtime', label: 'Runtime & nodes', routeIds: ['terminal', 'nodes', 'approvals'] },
  { id: 'development', label: 'Development', routeIds: ['workspaces', 'repositories'] },
  { id: 'workspace', label: 'Workspace & ops', routeIds: ['namespaces', 'artifacts', 'system', 'settings', 'plugins'] }
];

const routeMap = new Map<string, AppRouteDefinition>(appRoutes.map((route) => [route.path, route]));

export const defaultRoute = appRoutes.find((route) => route.id === 'dashboard') ?? appRoutes[0];

export const resolveAppRoute = (pathname: string) => {
  return routeMap.get(pathname) ?? defaultRoute;
};

export const canAccessRoute = (role: AppRole | undefined, routeId: AppRouteId) => {
  const route = appRoutes.find((item) => item.id === routeId);
  if (!route) return false;
  if (!route.allowedRoles) return true;
  return Boolean(role && route.allowedRoles.includes(role));
};

export const firstRouteForRole = (role: AppRole | undefined) =>
  appRoutes.find((route) => canAccessRoute(role, route.id)) ?? defaultRoute;
