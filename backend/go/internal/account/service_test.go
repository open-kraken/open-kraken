package account

import (
	"testing"

	"open-kraken/backend/go/internal/authz"
)

func TestServiceSeedsAuthenticatesCreatesAndUpdatesAccounts(t *testing.T) {
	svc, err := NewService(t.TempDir(), []SeedAccount{{
		MemberID:    "owner_1",
		WorkspaceID: "ws_open_kraken",
		DisplayName: "Owner",
		Role:        authz.RoleOwner,
		Password:    "admin",
		Avatar:      "OW",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok, err := svc.Authenticate("owner_1", "admin"); err != nil || !ok {
		t.Fatalf("authenticate seed ok=%v err=%v", ok, err)
	}
	if _, ok, err := svc.Authenticate("owner_1", "wrong"); err != nil || ok {
		t.Fatalf("authenticate wrong password ok=%v err=%v", ok, err)
	}
	created, err := svc.Create(SeedAccount{
		MemberID:    "new_user",
		WorkspaceID: "ws_open_kraken",
		DisplayName: "New User",
		Role:        authz.RoleMember,
		Password:    "secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.MemberID != "new_user" || created.Role != authz.RoleMember {
		t.Fatalf("unexpected created account: %+v", created)
	}
	updated, err := svc.Update("new_user", SeedAccount{Role: authz.RoleSupervisor, Password: "next"})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Role != authz.RoleSupervisor {
		t.Fatalf("role was not updated: %+v", updated)
	}
	if _, ok, err := svc.Authenticate("new_user", "secret"); err != nil || ok {
		t.Fatalf("old password should fail ok=%v err=%v", ok, err)
	}
	if _, ok, err := svc.Authenticate("new_user", "next"); err != nil || !ok {
		t.Fatalf("new password should pass ok=%v err=%v", ok, err)
	}
}
