package authz

import (
	"errors"
	"fmt"
)

var ErrForbidden = errors.New("authz: forbidden")

type Decision struct {
	Allowed bool
	Reason  string
}

type Service struct{}

func NewService() Service {
	return Service{}
}

func (s Service) Enforce(ctx AuthContext) error {
	decision := s.Authorize(ctx)
	if decision.Allowed {
		return nil
	}
	return fmt.Errorf("%w: %s", ErrForbidden, decision.Reason)
}

func (s Service) Authorize(ctx AuthContext) Decision {
	if !ctx.Actor.Role.valid() {
		return deny("unknown role")
	}
	if ctx.Actor.MemberID == "" || ctx.Actor.WorkspaceID == "" || ctx.WorkspaceID == "" {
		return deny("missing actor or workspace context")
	}
	if ctx.Actor.WorkspaceID != ctx.WorkspaceID {
		return deny("cross-workspace access denied")
	}
	if ctx.TargetMemberID == "" && requiresTarget(ctx.Action) {
		return deny("target member is required")
	}

	switch ctx.Action {
	case ActionMemberManage:
		return allowRoles(ctx.Actor.Role, RoleOwner, RoleSupervisor)
	case ActionRoleChange:
		return s.authorizeRoleChange(ctx)
	case ActionChatSend:
		return allowRoles(ctx.Actor.Role, RoleOwner, RoleSupervisor, RoleAssistant, RoleMember)
	case ActionRoadmapRead, ActionProjectDataRead, ActionTerminalAttach:
		return allowRoles(ctx.Actor.Role, RoleOwner, RoleSupervisor, RoleAssistant, RoleMember)
	case ActionRoadmapWrite, ActionProjectDataWrite:
		return allowRoles(ctx.Actor.Role, RoleOwner, RoleSupervisor, RoleAssistant)
	case ActionTerminalDispatch, ActionCollaborationCommand:
		return allowRoles(ctx.Actor.Role, RoleOwner, RoleSupervisor)
	default:
		return deny("unknown action")
	}
}

func (s Service) CapabilitiesFor(actor Principal) CapabilitySet {
	base := AuthContext{
		Actor:          actor,
		WorkspaceID:    actor.WorkspaceID,
		ConversationID: "server-derived",
		TargetMemberID: actor.MemberID,
		ResourceOwner:  actor.MemberID,
	}
	return CapabilitySet{
		ManageMembers:        s.Authorize(withAction(base, ActionMemberManage)).Allowed,
		ChangeRoles:          s.Authorize(withAction(base, ActionRoleChange)).Allowed,
		SendChat:             s.Authorize(withAction(base, ActionChatSend)).Allowed,
		ReadRoadmap:          s.Authorize(withAction(base, ActionRoadmapRead)).Allowed,
		WriteRoadmap:         s.Authorize(withAction(base, ActionRoadmapWrite)).Allowed,
		ReadProjectData:      s.Authorize(withAction(base, ActionProjectDataRead)).Allowed,
		WriteProjectData:     s.Authorize(withAction(base, ActionProjectDataWrite)).Allowed,
		AttachTerminal:       s.Authorize(withAction(base, ActionTerminalAttach)).Allowed,
		DispatchTerminal:     s.Authorize(withAction(base, ActionTerminalDispatch)).Allowed,
		CommandCollaboration: s.Authorize(withAction(base, ActionCollaborationCommand)).Allowed,
	}
}

func (s Service) BuildMemberReadModel(actor Principal, member Principal, displayName string, presence string, terminalStatus string) MemberReadModel {
	return MemberReadModel{
		MemberID:       member.MemberID,
		WorkspaceID:    member.WorkspaceID,
		DisplayName:    displayName,
		RoleType:       member.Role,
		Presence:       presence,
		TerminalStatus: terminalStatus,
		Capabilities:   s.CapabilitiesFor(actor),
	}
}

func (s Service) authorizeRoleChange(ctx AuthContext) Decision {
	switch ctx.Actor.Role {
	case RoleOwner:
		return allow()
	case RoleSupervisor:
		if ctx.TargetMemberID == ctx.ResourceOwner {
			return deny("supervisor cannot self-promote or self-demote")
		}
		return allow()
	default:
		return deny(fmt.Sprintf("%s cannot change roles", ctx.Actor.Role))
	}
}

func requiresTarget(action Action) bool {
	return action == ActionRoleChange
}

func withAction(ctx AuthContext, action Action) AuthContext {
	ctx.Action = action
	return ctx
}

func allowRoles(role Role, allowed ...Role) Decision {
	for _, item := range allowed {
		if role == item {
			return allow()
		}
	}
	return deny(fmt.Sprintf("%s is not allowed", role))
}

func allow() Decision {
	return Decision{Allowed: true}
}

func deny(reason string) Decision {
	return Decision{Allowed: false, Reason: reason}
}
