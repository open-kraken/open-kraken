package plugin

import (
	"context"
	"testing"
)

func TestListAvailable(t *testing.T) {
	svc := NewService()
	plugins := svc.ListAvailable(context.Background())
	if len(plugins) != 6 {
		t.Fatalf("expected 6 plugins, got %d", len(plugins))
	}
	for _, p := range plugins {
		if p.Installed {
			t.Fatalf("expected none installed initially, %s is installed", p.ID)
		}
	}
}

func TestInstallAndList(t *testing.T) {
	svc := NewService()
	ctx := context.Background()

	p, err := svc.Install(ctx, "plugin-code-review")
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if !p.Installed {
		t.Fatal("expected installed=true")
	}

	installed := svc.ListInstalled(ctx)
	if len(installed) != 1 {
		t.Fatalf("expected 1 installed, got %d", len(installed))
	}

	// Check available shows installed flag.
	available := svc.ListAvailable(ctx)
	found := false
	for _, a := range available {
		if a.ID == "plugin-code-review" && a.Installed {
			found = true
		}
	}
	if !found {
		t.Fatal("expected code-review to show installed in available list")
	}
}

func TestInstallDuplicate(t *testing.T) {
	svc := NewService()
	ctx := context.Background()
	svc.Install(ctx, "plugin-code-review")
	_, err := svc.Install(ctx, "plugin-code-review")
	if err != ErrAlreadyExists {
		t.Fatalf("expected ErrAlreadyExists, got %v", err)
	}
}

func TestInstallNotFound(t *testing.T) {
	svc := NewService()
	_, err := svc.Install(context.Background(), "nonexistent")
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRemove(t *testing.T) {
	svc := NewService()
	ctx := context.Background()
	svc.Install(ctx, "plugin-code-review")

	if err := svc.Remove(ctx, "plugin-code-review"); err != nil {
		t.Fatalf("remove: %v", err)
	}

	installed := svc.ListInstalled(ctx)
	if len(installed) != 0 {
		t.Fatalf("expected 0 installed after remove, got %d", len(installed))
	}
}

func TestRemoveNotFound(t *testing.T) {
	svc := NewService()
	err := svc.Remove(context.Background(), "nonexistent")
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
