package integration_test

import (
	"testing"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/testing/testkit"
)

func TestAssistantMessageFlowKeepsDomainAndAuthorizationAligned(t *testing.T) {
	fixture := testkit.NewWorkspaceConversationFixture()
	service := authz.NewService()
	assistant := testkit.AssistantPrincipal(fixture.WorkspaceID, fixture.Member.ID)

	if err := fixture.Conversation.Validate(); err != nil {
		t.Fatalf("conversation fixture invalid: %v", err)
	}
	if err := fixture.Member.Validate(); err != nil {
		t.Fatalf("member fixture invalid: %v", err)
	}
	if err := fixture.Message.ValidateReferences(fixture.Conversation, fixture.Member); err != nil {
		t.Fatalf("message references invalid: %v", err)
	}

	testkit.RequireAllowed(t, "assistant chat send", service.Authorize(authz.AuthContext{
		Actor:          assistant,
		WorkspaceID:    fixture.WorkspaceID,
		Action:         authz.ActionChatSend,
		ConversationID: fixture.Conversation.ID,
	}))
	testkit.RequireAllowed(t, "assistant project data write", service.Authorize(authz.AuthContext{
		Actor:       assistant,
		WorkspaceID: fixture.WorkspaceID,
		Action:      authz.ActionProjectDataWrite,
	}))
	testkit.RequireDenied(t, "assistant terminal dispatch", service.Authorize(authz.AuthContext{
		Actor:       assistant,
		WorkspaceID: fixture.WorkspaceID,
		Action:      authz.ActionTerminalDispatch,
	}))

	readModel := service.BuildMemberReadModel(
		assistant,
		assistant,
		fixture.Member.DisplayName,
		"online",
		"attached",
	)
	if !readModel.Capabilities.WriteProjectData || readModel.Capabilities.DispatchTerminal {
		t.Fatalf("assistant capabilities drifted from policy: %+v", readModel.Capabilities)
	}
}
