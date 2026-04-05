export type AppRouteId = 'chat' | 'members' | 'roadmap' | 'terminal' | 'system' | 'settings';

export type AppRouteDefinition = {
  id: AppRouteId;
  path: `/${string}`;
  label: string;
  description: string;
};

export const appRoutes: AppRouteDefinition[] = [
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
    id: 'roadmap',
    path: '/roadmap',
    label: 'Roadmap',
    description: 'Roadmap + project data with persistence outcomes and conflicts.'
  },
  {
    id: 'terminal',
    path: '/terminal',
    label: 'Sessions',
    description: 'Attach to agent PTY streams (snapshot / delta / status).'
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
  }
];

export type AppNavGroup = {
  id: 'collaboration' | 'delivery' | 'runtime' | 'workspace';
  label: string;
  routeIds: AppRouteId[];
};

export const appNavGroups: AppNavGroup[] = [
  { id: 'collaboration', label: 'Collaboration', routeIds: ['chat', 'members'] },
  { id: 'delivery', label: 'Delivery', routeIds: ['roadmap'] },
  { id: 'runtime', label: 'Agents & runtime', routeIds: ['terminal'] },
  { id: 'workspace', label: 'Workspace & ops', routeIds: ['system', 'settings'] }
];

const routeMap = new Map<string, AppRouteDefinition>(appRoutes.map((route) => [route.path, route]));

export const defaultRoute = appRoutes[0];

export const resolveAppRoute = (pathname: string) => {
  return routeMap.get(pathname) ?? defaultRoute;
};
