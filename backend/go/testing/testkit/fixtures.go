package testkit

import (
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/domain/role"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/tokentrack"
)

// ── Principal fixtures ──────────────────────────────────────────────────────

func OwnerPrincipal(workspaceID, memberID string) authz.Principal {
	return authz.Principal{MemberID: memberID, WorkspaceID: workspaceID, Role: authz.RoleOwner}
}

func SupervisorPrincipal(workspaceID, memberID string) authz.Principal {
	return authz.Principal{MemberID: memberID, WorkspaceID: workspaceID, Role: authz.RoleSupervisor}
}

func MemberPrincipal(workspaceID, memberID string) authz.Principal {
	return authz.Principal{MemberID: memberID, WorkspaceID: workspaceID, Role: authz.RoleMember}
}

// ── Multi-member workspace fixture ──────────────────────────────────────────

type TeamWorkspaceFixture struct {
	WorkspaceID   string
	Owner         member.Member
	Supervisor    member.Member
	Assistant     member.Member
	RegularMember member.Member
	Conversations []conversation.Conversation
	Messages      []message.Message
}

func NewTeamWorkspaceFixture() TeamWorkspaceFixture {
	now := FixedTime()
	return TeamWorkspaceFixture{
		WorkspaceID: "ws-team",
		Owner: member.Member{
			ID: "owner-1", WorkspaceID: "ws-team", UserID: "u-owner",
			DisplayName: "Claire", Role: role.Owner,
			Status: member.StatusActive, CreatedAt: now, UpdatedAt: now, Version: 1,
		},
		Supervisor: member.Member{
			ID: "super-1", WorkspaceID: "ws-team", UserID: "u-super",
			DisplayName: "Planner", Role: role.Supervisor,
			Status: member.StatusActive, CreatedAt: now, UpdatedAt: now, Version: 1,
		},
		Assistant: member.Member{
			ID: "assist-1", WorkspaceID: "ws-team", UserID: "u-assist",
			DisplayName: "Coder", Role: role.Assistant,
			Status: member.StatusActive, CreatedAt: now, UpdatedAt: now, Version: 1,
		},
		RegularMember: member.Member{
			ID: "member-1", WorkspaceID: "ws-team", UserID: "u-member",
			DisplayName: "Viewer", Role: role.Member,
			Status: member.StatusActive, CreatedAt: now, UpdatedAt: now, Version: 1,
		},
		Conversations: []conversation.Conversation{
			{
				ID: "conv-general", WorkspaceID: "ws-team",
				Kind: conversation.KindChannel, Title: "General",
				MemberIDs: []string{"owner-1", "super-1", "assist-1", "member-1"},
				CreatedAt: now, UpdatedAt: now, Version: 1,
			},
			{
				ID: "conv-dev", WorkspaceID: "ws-team",
				Kind: conversation.KindChannel, Title: "Development",
				MemberIDs: []string{"owner-1", "assist-1"},
				CreatedAt: now, UpdatedAt: now, Version: 1,
			},
		},
		Messages: []message.Message{
			{
				ID: "msg-1", WorkspaceID: "ws-team", ConversationID: "conv-general",
				SenderMemberID: "owner-1", Body: "welcome to the team",
				Status: message.StatusSent, CreatedAt: now, UpdatedAt: now, Version: 1,
			},
			{
				ID: "msg-2", WorkspaceID: "ws-team", ConversationID: "conv-general",
				SenderMemberID: "assist-1", Body: "ready to work",
				Status: message.StatusSent, CreatedAt: now.Add(time.Second), UpdatedAt: now.Add(time.Second), Version: 1,
			},
		},
	}
}

// ── Node fixtures ───────────────────────────────────────────────────────────

func NewNodeFixture(id, hostname string) node.Node {
	return node.Node{
		ID:              id,
		Hostname:        hostname,
		NodeType:        node.NodeTypeK8sPod,
		Status:          node.NodeStatusOnline,
		Labels:          map[string]string{"env": "test"},
		WorkspaceID:     "ws-team",
		RegisteredAt:    FixedTime(),
		LastHeartbeatAt: FixedTime(),
	}
}

func NewBareMetalNodeFixture(id, hostname string) node.Node {
	n := NewNodeFixture(id, hostname)
	n.NodeType = node.NodeTypeBareMetal
	return n
}

// ── Token event fixtures ────────────────────────────────────────────────────

func NewTokenEventFixture(memberID, nodeID, model string) tokentrack.TokenEvent {
	return tokentrack.TokenEvent{
		ID:           "tok-fixture-1",
		MemberID:     memberID,
		NodeID:       nodeID,
		Model:        model,
		InputTokens:  500,
		OutputTokens: 200,
		Cost:         0.0035,
		Timestamp:    FixedTime(),
	}
}

// ── Ledger event fixtures ───────────────────────────────────────────────────

func NewLedgerEventFixture(workspaceID, memberID string) ledger.LedgerEvent {
	return ledger.LedgerEvent{
		ID:          "led-fixture-1",
		WorkspaceID: workspaceID,
		MemberID:    memberID,
		EventType:   "command.execute",
		Summary:     "deployed to staging",
		ContextJSON: `{"target": "staging"}`,
		Timestamp:   FixedTime(),
	}
}

// ── Memory entry fixtures ───────────────────────────────────────────────────

func NewMemoryEntryFixture(scope, key, value string) memory.MemoryEntry {
	return memory.MemoryEntry{
		ID:    "mem-fixture-1",
		Scope: memory.Scope(scope),
		Key:   key,
		Value: value,
	}
}
