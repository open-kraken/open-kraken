package skill

import (
	"bufio"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Loader scans a directory tree for markdown skill files and returns SkillEntry
// slices. It parses YAML-style frontmatter (--- delimited) to extract the
// name and description fields; all other fields fall back to file-derived values.
type Loader struct {
	rootDir string
}

// NewLoader creates a Loader that scans rootDir for .md files.
func NewLoader(rootDir string) *Loader {
	return &Loader{rootDir: strings.TrimSpace(rootDir)}
}

// Load walks the root directory, parses each .md file, and returns a slice of
// SkillEntry values. Files that cannot be read are silently skipped.
func (l *Loader) Load() ([]SkillEntry, error) {
	var entries []SkillEntry
	err := filepath.WalkDir(l.rootDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		entry, ok := parseSkillFile(path, l.rootDir)
		if ok {
			entries = append(entries, entry)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return entries, nil
}

// parseSkillFile reads a markdown file and returns a populated SkillEntry.
// Returns (entry, false) if the file cannot be read.
func parseSkillFile(path, rootDir string) (SkillEntry, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return SkillEntry{}, false
	}
	content := string(data)
	name, description, body := parseFrontmatter(content)

	// Derive name from file stem when frontmatter omits it.
	if name == "" {
		stem := strings.TrimSuffix(filepath.Base(path), ".md")
		name = stem
	}

	// Derive category from the first path component under rootDir.
	rel, _ := filepath.Rel(rootDir, filepath.Dir(path))
	category := ""
	if rel != "." && rel != "" {
		parts := strings.SplitN(rel, string(filepath.Separator), 2)
		category = parts[0]
	}

	// Truncate body to 256 runes for the content summary.
	runes := []rune(strings.TrimSpace(body))
	if len(runes) > 256 {
		runes = runes[:256]
	}

	return SkillEntry{
		Name:           name,
		Description:    description,
		Path:           path,
		Category:       category,
		ContentSummary: string(runes),
	}, true
}

// parseFrontmatter extracts name and description from YAML-style frontmatter.
// It returns the extracted fields plus the remaining body (content after frontmatter).
// If no frontmatter block is found, all fields are empty strings.
func parseFrontmatter(content string) (name, description, body string) {
	const delimiter = "---"
	lines := splitLines(content)

	if len(lines) == 0 || strings.TrimSpace(lines[0]) != delimiter {
		return "", "", content
	}

	end := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == delimiter {
			end = i
			break
		}
	}
	if end < 0 {
		return "", "", content
	}

	frontLines := lines[1:end]
	for _, line := range frontLines {
		key, value, ok := parseFrontmatterLine(line)
		if !ok {
			continue
		}
		switch key {
		case "name":
			name = value
		case "description":
			description = value
		}
	}

	body = strings.Join(lines[end+1:], "\n")
	return name, description, body
}

// parseFrontmatterLine splits a single "key: value" line into its parts.
func parseFrontmatterLine(line string) (key, value string, ok bool) {
	idx := strings.Index(line, ":")
	if idx < 0 {
		return "", "", false
	}
	key = strings.ToLower(strings.TrimSpace(line[:idx]))
	value = strings.TrimSpace(line[idx+1:])
	// Strip surrounding quotes from value.
	if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
		value = value[1 : len(value)-1]
	}
	return key, value, true
}

func splitLines(s string) []string {
	var lines []string
	scanner := bufio.NewScanner(strings.NewReader(s))
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines
}
