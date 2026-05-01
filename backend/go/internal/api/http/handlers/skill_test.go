package handlers

import (
	"errors"
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

func TestWriteErrorUsesSharedEnvelope(t *testing.T) {
	rec := httptest.NewRecorder()
	rec.Header().Set("X-Request-Id", "req_test")

	writeError(rec, http.StatusConflict, errors.New("version mismatch"))

	body := rec.Body.String()
	for _, want := range []string{`"error":{`, `"code":"conflict"`, `"message":"version mismatch"`, `"status":409`, `"requestId":"req_test"`, `"retryable":false`} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected %s in shared envelope: %s", want, body)
		}
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

func TestSkillHandlerReloadRescansCatalog(t *testing.T) {
	h, skillDir := newTestSkillHandler(t)

	if err := os.WriteFile(filepath.Join(skillDir, "reloadable.md"), []byte("---\nname: reloadable\ndescription: Reload helper\n---\n"), 0o644); err != nil {
		t.Fatalf("write reloadable skill: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/skills/reload", nil)
	rec := httptest.NewRecorder()
	h.HandleSkillsReload(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"loaded":1`) {
		t.Fatalf("expected loaded count in response: %s", rec.Body.String())
	}
}

func TestSkillHandlerBindAndListMemberSkills(t *testing.T) {
	h, skillDir := newTestSkillHandler(t)

	if err := os.WriteFile(filepath.Join(skillDir, "deploy.md"), []byte("---\nname: deploy\ndescription: Deploy helper\n---\n"), 0o644); err != nil {
		t.Fatalf("write deploy skill: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "test-runner.md"), []byte("---\nname: test-runner\ndescription: Test helper\n---\n"), 0o644); err != nil {
		t.Fatalf("write test-runner skill: %v", err)
	}

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

func TestSkillHandlerRejectsUnknownMemberSkill(t *testing.T) {
	h, _ := newTestSkillHandler(t)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/members/m-1/skills", strings.NewReader(`{"skills":["missing"]}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.HandleMemberSkills(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `unknown skill`) {
		t.Fatalf("expected unknown skill error: %s", rec.Body.String())
	}
}

func TestSkillHandlerRejectsSkillBindingForNonAssistant(t *testing.T) {
	h, skillDir := newTestSkillHandler(t)
	if err := os.WriteFile(filepath.Join(skillDir, "deploy.md"), []byte("---\nname: deploy\ndescription: Deploy helper\n---\n"), 0o644); err != nil {
		t.Fatalf("write deploy skill: %v", err)
	}
	h.SetMemberSkillEligibility(func(memberID string) bool {
		return memberID == "assistant-1"
	})

	req := httptest.NewRequest(http.MethodPut, "/api/v1/members/human-1/skills", strings.NewReader(`{"skills":["deploy"]}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.HandleMemberSkills(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `AI Assistant`) {
		t.Fatalf("expected assistant eligibility error: %s", rec.Body.String())
	}
}

func TestSkillHandlerAllowsEmptySkillClearForNonAssistant(t *testing.T) {
	h, _ := newTestSkillHandler(t)
	h.SetMemberSkillEligibility(func(memberID string) bool {
		return memberID == "assistant-1"
	})

	req := httptest.NewRequest(http.MethodPut, "/api/v1/members/human-1/skills", strings.NewReader(`{"skills":[]}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.HandleMemberSkills(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"skills":[]`) {
		t.Fatalf("expected empty skills response: %s", rec.Body.String())
	}
}
