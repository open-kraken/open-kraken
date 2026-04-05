package skill

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// writeFile is a test helper that writes content to a file, creating parent dirs.
func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}

func TestLoaderParsesMarkdownWithFrontmatter(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "alpha", "tool.md"), `---
name: my-tool
description: Does something useful
---
# Body content here
`)

	loader := NewLoader(dir)
	entries, err := loader.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Name != "my-tool" {
		t.Errorf("name: expected my-tool, got %q", e.Name)
	}
	if e.Description != "Does something useful" {
		t.Errorf("description: got %q", e.Description)
	}
	if e.Category != "alpha" {
		t.Errorf("category: expected alpha, got %q", e.Category)
	}
}

func TestLoaderDeriveNameFromFileStem(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "no-frontmatter.md"), "# Just a heading\nSome content")

	entries, err := NewLoader(dir).Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Name != "no-frontmatter" {
		t.Errorf("expected name no-frontmatter, got %q", entries[0].Name)
	}
}

func TestLoaderContentSummaryTruncated(t *testing.T) {
	dir := t.TempDir()
	long := "A"
	for i := 0; i < 300; i++ {
		long += "B"
	}
	writeFile(t, filepath.Join(dir, "big.md"), long)

	entries, err := NewLoader(dir).Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len([]rune(entries[0].ContentSummary)) > 256 {
		t.Errorf("content summary too long: %d", len(entries[0].ContentSummary))
	}
}

func TestServiceBindAndList(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "skills", "tool.md"), "---\nname: toolx\ndescription: A tool\n---\n")

	svc := NewService(NewLoader(filepath.Join(dir, "skills")), NewJSONBindingRepository(dir))
	ctx := context.Background()

	if err := svc.BindSkill(ctx, "m1", "toolx"); err != nil {
		t.Fatalf("bind: %v", err)
	}

	members, err := svc.ListMemberSkills(ctx, "m1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(members) != 1 || members[0].Name != "toolx" {
		t.Errorf("unexpected member skills: %v", members)
	}
}

func TestServiceBindIdempotent(t *testing.T) {
	dir := t.TempDir()
	svc := NewService(NewLoader(dir), NewJSONBindingRepository(dir))
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if err := svc.BindSkill(ctx, "m1", "skill-x"); err != nil {
			t.Fatalf("bind #%d: %v", i, err)
		}
	}
	names, _ := svc.binding.ListByMember(ctx, "m1")
	if len(names) != 1 {
		t.Errorf("expected 1 binding, got %d", len(names))
	}
}

func TestServiceUnbind(t *testing.T) {
	dir := t.TempDir()
	svc := NewService(NewLoader(dir), NewJSONBindingRepository(dir))
	ctx := context.Background()

	_ = svc.BindSkill(ctx, "m1", "skill-a")
	if err := svc.UnbindSkill(ctx, "m1", "skill-a"); err != nil {
		t.Fatalf("unbind: %v", err)
	}
	names, _ := svc.binding.ListByMember(ctx, "m1")
	if len(names) != 0 {
		t.Errorf("expected 0 bindings after unbind, got %d", len(names))
	}
}

func TestServiceUnbindNotFound(t *testing.T) {
	dir := t.TempDir()
	svc := NewService(NewLoader(dir), NewJSONBindingRepository(dir))
	err := svc.UnbindSkill(context.Background(), "m1", "no-such-skill")
	if !errors.Is(err, ErrBindingNotFound) {
		t.Errorf("expected ErrBindingNotFound, got %v", err)
	}
}

func TestServiceBindValidation(t *testing.T) {
	dir := t.TempDir()
	svc := NewService(NewLoader(dir), NewJSONBindingRepository(dir))
	ctx := context.Background()

	if err := svc.BindSkill(ctx, "", "s"); err == nil {
		t.Error("expected error for empty memberID")
	}
	if err := svc.BindSkill(ctx, "m1", ""); err == nil {
		t.Error("expected error for empty skillName")
	}
}
