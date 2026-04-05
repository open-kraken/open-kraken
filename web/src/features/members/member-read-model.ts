export type RoleType = "owner" | "supervisor" | "assistant" | "member";

export type PresenceState = "offline" | "online" | "away" | "busy";

export type TerminalStatus = "idle" | "attached" | "busy" | "error" | "offline";

export type CollaborationStatus = "idle" | "running" | "success" | "error" | "offline";

export type CapabilityFlags = {
  manageMembers: boolean;
  changeRoles: boolean;
  sendChat: boolean;
  readRoadmap: boolean;
  writeRoadmap: boolean;
  readProjectData: boolean;
  writeProjectData: boolean;
  attachTerminal: boolean;
  dispatchTerminal: boolean;
  commandCollaboration: boolean;
};

export type MemberReadModel = {
  memberId: string;
  workspaceId: string;
  displayName: string;
  roleType: RoleType;
  presence: PresenceState;
  terminalStatus: TerminalStatus;
  capabilities: CapabilityFlags;
};

export type MemberCollabReadModel = {
  agentId: string;
  memberId: string;
  workspaceId: string;
  displayName: string;
  role: RoleType;
  avatarUrl?: string;
  status: CollaborationStatus;
  statusLabel: string;
  activeTask?: string | null;
  lastUpdatedAt?: string | null;
};

// `presence` is sourced from collaboration presence state.
// `terminalStatus` is sourced from terminal/session runtime state.
export const memberCapabilityKeys: Array<keyof CapabilityFlags> = [
  "manageMembers",
  "changeRoles",
  "sendChat",
  "readRoadmap",
  "writeRoadmap",
  "readProjectData",
  "writeProjectData",
  "attachTerminal",
  "dispatchTerminal",
  "commandCollaboration",
];
