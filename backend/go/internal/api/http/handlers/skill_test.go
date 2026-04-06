package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/skill"
)

func newTestSkillHandler(t *testing.T) (*SkillHandler, string) {
	t.Helper()
	skillDir := t.TempDir()
	dataDir := t.TempDir()
	loader := skill.NewLoader(skillDir)
	bindingRepo := skill.NewJSONBindingRepository(filepath.Join(dataDir, "skills"))
	svc := skill.NewService(loader, bindingRepo)
	return NewSkillHandler(svc, "/api/v1/members/"), skillDir
}

func TestSkillHandlerListSkillsEmpty(t *testing.T) {
	h, _ := newTestSkillHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/skills", nil)
	rec := httptest.NewRecorder()
	h.HandleSkills(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"items"`) {
		t.Error("expected items in response")
	}
}

func TestSkillHandlerListSkillsWithFiles(t *testing.T) {
	h, skillDir := newTestSkillHandler(t)

	// Create a skill file.
	skillContent := `---
name: code-review
description: Reviews code for quality
---
Review the code and provide feedback.`
	if err := os.WriteFile(filepath.Join(skillDir, "code-review.md"), []byte(skillContent), 0o644); err != nil {
		t.Fatalf("write skill file: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/skills", nil)
	rec := httptest.NewRecorder()
	h.HandleSkills(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "code-review") {
		t.Errorf("expected code-review in response: %s", rec.Body.String())
	}
}

func TestSkillHandlerBindAndListMemberSkills(t *testing.T) {
	h, _ := newTestSkillHandler(t)

	// Bind skills via PUT with skills array.
	body := `{"skills": ["deploy", "test-runner"]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/members/m-1/skills", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.HandleMemberSkills(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("bind expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// List member skills.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/members/m-1/skills", nil)
	rec = httptest.NewRecorder()
	h.HandleMemberSkills(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
