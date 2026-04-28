package authz

type Role string

const (
	RoleOwner      Role = "owner"
	RoleSupervisor Role = "supervisor"
	RoleAssistant  Role = "assistant"
	RoleMember     Role = "member"
)

type Action string

const (
	ActionMemberManage         Action = "member.manage"
	ActionRoleChange           Action = "member.role.change"
	ActionChatSend             Action = "chat.send"
	ActionRoadmapRead          Action = "roadmap.read"
	ActionRoadmapWrite         Action = "roadmap.write"
	ActionProjectDataRead      Action = "projectdata.read"
	ActionProjectDataWrite     Action = "projectdata.write"
	ActionTerminalAttach       Action = "terminal.attach"
	ActionTerminalDispatch     Action = "terminal.dispatch"
	ActionCollaborationCommand Action = "collaboration.command"
	ActionApprovalDecide       Action = "approval.decide"
)

type Principal struct {
	MemberID    string
	WorkspaceID string
	Role        Role
}

type AuthContext struct {
	Actor          Principal
	WorkspaceID    string
	ConversationID string
	TargetMemberID string
	ResourceOwner  string
	Action         Action
}

type CapabilitySet struct {
	ManageMembers        bool
	ChangeRoles          bool
	SendChat             bool
	ReadRoadmap          bool
	WriteRoadmap         bool
	ReadProjectData      bool
	WriteProjectData     bool
	AttachTerminal       bool
	DispatchTerminal     bool
	CommandCollaboration bool
	DecideApprovals      bool
}

type MemberReadModel struct {
	MemberID       string
	WorkspaceID    string
	DisplayName    string
	RoleType       Role
	Presence       string
	TerminalStatus string
	Capabilities   CapabilitySet
}

func (r Role) valid() bool {
	switch r {
	case RoleOwner, RoleSupervisor, RoleAssistant, RoleMember:
		return true
	default:
		return false
	}
}
