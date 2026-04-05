package authz

import "testing"

func TestAuthorizeOwnerSupervisorBoundary(t *testing.T) {
	service := NewService()

	owner := service.Authorize(AuthContext{
		Actor:          Principal{MemberID: "owner-1", WorkspaceID: "ws-1", Role: RoleOwner},
		WorkspaceID:    "ws-1",
		Action:         ActionTerminalDispatch,
		TargetMemberID: "member-2",
		ResourceOwner:  "member-2",
	})
	if !owner.Allowed {
		t.Fatalf("owner should be allowed to dispatch terminal: %+v", owner)
	}

	supervisor := service.Authorize(AuthContext{
		Actor:          Principal{MemberID: "sup-1", WorkspaceID: "ws-1", Role: RoleSupervisor},
		WorkspaceID:    "ws-1",
		Action:         ActionCollaborationCommand,
		TargetMemberID: "member-2",
		ResourceOwner:  "member-2",
	})
	if !supervisor.Allowed {
		t.Fatalf("supervisor should be allowed to command collaboration: %+v", supervisor)
	}
}

func TestAuthorizeAssistantAndMemberRestrictions(t *testing.T) {
	service := NewService()

	assistant := service.Authorize(AuthContext{
		Actor:       Principal{MemberID: "assistant-1", WorkspaceID: "ws-1", Role: RoleAssistant},
		WorkspaceID: "ws-1",
		Action:      ActionProjectDataWrite,
	})
	if !assistant.Allowed {
		t.Fatalf("assistant should be allowed to write project data: %+v", assistant)
	}

	member := service.Authorize(AuthContext{
		Actor:       Principal{MemberID: "member-1", WorkspaceID: "ws-1", Role: RoleMember},
		WorkspaceID: "ws-1",
		Action:      ActionProjectDataWrite,
	})
	if member.Allowed {
		t.Fatalf("member should not be allowed to write project data: %+v", member)
	}

	assistantDispatch := service.Authorize(AuthContext{
		Actor:       Principal{MemberID: "assistant-1", WorkspaceID: "ws-1", Role: RoleAssistant},
		WorkspaceID: "ws-1",
		Action:      ActionTerminalDispatch,
	})
	if assistantDispatch.Allowed {
		t.Fatalf("assistant should not be allowed to dispatch terminal: %+v", assistantDispatch)
	}
}

func TestAuthorizeRejectsCrossWorkspace(t *testing.T) {
	service := NewService()
	decision := service.Authorize(AuthContext{
		Actor:       Principal{MemberID: "owner-1", WorkspaceID: "ws-1", Role: RoleOwner},
		WorkspaceID: "ws-2",
		Action:      ActionMemberManage,
	})
	if decision.Allowed {
		t.Fatalf("cross-workspace access must be rejected")
	}
}

func TestAuthorizeRoleChangeTargetRestrictions(t *testing.T) {
	service := NewService()

	supervisorSelf := service.Authorize(AuthContext{
		Actor:          Principal{MemberID: "sup-1", WorkspaceID: "ws-1", Role: RoleSupervisor},
		WorkspaceID:    "ws-1",
		Action:         ActionRoleChange,
		TargetMemberID: "sup-1",
		ResourceOwner:  "sup-1",
	})
	if supervisorSelf.Allowed {
		t.Fatalf("supervisor self role change must be rejected")
	}

	supervisorOther := service.Authorize(AuthContext{
		Actor:          Principal{MemberID: "sup-1", WorkspaceID: "ws-1", Role: RoleSupervisor},
		WorkspaceID:    "ws-1",
		Action:         ActionRoleChange,
		TargetMemberID: "member-2",
		ResourceOwner:  "owner-1",
	})
	if !supervisorOther.Allowed {
		t.Fatalf("supervisor should be allowed to change another member role: %+v", supervisorOther)
	}

	memberOther := service.Authorize(AuthContext{
		Actor:          Principal{MemberID: "member-1", WorkspaceID: "ws-1", Role: RoleMember},
		WorkspaceID:    "ws-1",
		Action:         ActionRoleChange,
		TargetMemberID: "member-2",
		ResourceOwner:  "owner-1",
	})
	if memberOther.Allowed {
		t.Fatalf("member should not be allowed to change another member role")
	}
}

func TestBuildMemberReadModelUsesServerDerivedCapabilities(t *testing.T) {
	service := NewService()
	readModel := service.BuildMemberReadModel(
		Principal{MemberID: "assistant-1", WorkspaceID: "ws-1", Role: RoleAssistant},
		Principal{MemberID: "member-2", WorkspaceID: "ws-1", Role: RoleMember},
		"Worker",
		"online",
		"busy",
	)

	if !readModel.Capabilities.WriteRoadmap {
		t.Fatalf("assistant should inherit write roadmap capability")
	}
	if readModel.Capabilities.DispatchTerminal {
		t.Fatalf("assistant should not inherit dispatch capability")
	}
	if readModel.Presence != "online" || readModel.TerminalStatus != "busy" {
		t.Fatalf("read model must preserve presence and terminal status sources separately: %+v", readModel)
	}
}
