package skill

func builtinCatalog() []SkillEntry {
	return []SkillEntry{
		{
			Name:           "code-review",
			Description:    "Review code changes for correctness, regressions, and missing tests.",
			Path:           "builtin://code-review",
			Category:       "qa",
			ContentSummary: "Use when an AI Assistant should inspect a change set and report concrete findings before merge.",
		},
		{
			Name:           "test-gen",
			Description:    "Design and implement focused tests for changed behavior.",
			Path:           "builtin://test-gen",
			Category:       "qa",
			ContentSummary: "Use when an AI Assistant should add narrow tests that exercise the requested behavior.",
		},
		{
			Name:           "react-ui",
			Description:    "Build React UI changes that follow the existing design system.",
			Path:           "builtin://react-ui",
			Category:       "react",
			ContentSummary: "Use when an AI Assistant is assigned frontend work in the React/Vite web app.",
		},
		{
			Name:           "go-backend",
			Description:    "Implement Go backend changes using repository service and handler patterns.",
			Path:           "builtin://go-backend",
			Category:       "golang",
			ContentSummary: "Use when an AI Assistant is assigned Go API, service, or runtime work.",
		},
		{
			Name:           "devops-runtime",
			Description:    "Investigate local stack, Docker, runtime, and deployment issues.",
			Path:           "builtin://devops-runtime",
			Category:       "devops",
			ContentSummary: "Use when an AI Assistant should work on containers, processes, sessions, or environment setup.",
		},
	}
}
