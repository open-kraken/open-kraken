package semantic

import "testing"

func TestExtractCommandFromInput(t *testing.T) {
	cases := []struct {
		input  string
		expect string
	}{
		{"ls -la\n", "ls -la"},
		{"\n\necho hello\n\n", "echo hello"},
		{"", ""},
		{"\n\n\n", ""},
		{"single", "single"},
		{"first\nsecond\nthird", "third"},
	}
	for _, tc := range cases {
		got := ExtractCommandFromInput(tc.input)
		if got != tc.expect {
			t.Errorf("ExtractCommandFromInput(%q) = %q, want %q", tc.input, got, tc.expect)
		}
	}
}

func TestExtractInputLines(t *testing.T) {
	lines := ExtractInputLines("  first  \n\n  second  \n  \n  third  ")
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(lines))
	}
	if lines[0] != "first" || lines[1] != "second" || lines[2] != "third" {
		t.Fatalf("unexpected lines: %v", lines)
	}
}

func TestTrimContent(t *testing.T) {
	cases := []struct {
		input  string
		expect string
	}{
		{"\n\nhello\nworld\n\n", "hello\nworld"},
		{"  \n  \n  ", ""},
		{"single line", "single line"},
		{"\n\n\n", ""},
	}
	for _, tc := range cases {
		got := trimContent(tc.input)
		if got != tc.expect {
			t.Errorf("trimContent(%q) = %q, want %q", tc.input, got, tc.expect)
		}
	}
}
