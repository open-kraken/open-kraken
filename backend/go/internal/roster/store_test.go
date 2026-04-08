package roster_test

import (
	"os"
	"path/filepath"
	"testing"

	"open-kraken/backend/go/internal/roster"
)

func TestReadWriteRoundTrip(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	doc := roster.Document{
		Meta: roster.Meta{
			WorkspaceID: "ws_test",
			Version:     1,
			Storage:     "workspace",
		},
		Members: []map[string]any{{"memberId": "m1", "displayName": "One"}},
		Teams: []roster.Team{{TeamID: "t1", Name: "T", MemberIDs: []string{"m1"}}},
	}
	if err := roster.Write(root, doc); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, ".open-kraken", "roster.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
	got, found, err := roster.Read(root)
	if err != nil || !found {
		t.Fatalf("read: found=%v err=%v", found, err)
	}
	if got.Meta.WorkspaceID != "ws_test" || len(got.Members) != 1 || len(got.Teams) != 1 {
		t.Fatalf("unexpected %+v", got)
	}
}
