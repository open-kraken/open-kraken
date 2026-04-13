import type { AppRouteId } from '@/routes';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Users,
  Briefcase,
  GitBranch,
  Activity,
  Terminal,
  Network,
  Shield,
  Folder,
  Building2,
  Package,
  Settings,
  Puzzle,
  User,
  Play,
} from 'lucide-react';

type NavRouteIconProps = {
  routeId: AppRouteId;
  className?: string;
  title?: string;
};

const iconMap: Record<AppRouteId, React.ComponentType<{ size?: number; className?: string }>> = {
  dashboard: LayoutDashboard,
  ledger: FileText,
  runs: Play,
  chat: MessageSquare,
  members: Users,
  skills: Briefcase,
  taskmap: GitBranch,
  roadmap: Activity,
  terminal: Terminal,
  nodes: Network,
  approvals: Shield,
  workspaces: Folder,
  repositories: GitBranch,
  namespaces: Building2,
  artifacts: Package,
  system: Activity,
  settings: Settings,
  plugins: Puzzle,
  account: User,
};

export const NavRouteIcon = ({ routeId, className }: NavRouteIconProps) => {
  const Icon = iconMap[routeId] ?? Activity;
  return <Icon size={16} className={className} />;
};
