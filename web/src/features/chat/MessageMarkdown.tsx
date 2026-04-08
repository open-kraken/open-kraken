/**
 * Lightweight Markdown renderer for chat messages.
 * Supports: **bold**, *italic*, `inline code`, ```code blocks```, [links](url)
 * No external dependency — regex-based transformation to HTML.
 */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const renderInline = (text: string): string => {
  let result = escapeHtml(text);
  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="chat-md__code">$1</code>');
  // Bold: **text**
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat-md__link">$1</a>'
  );
  // Auto-link bare URLs
  result = result.replace(
    /(?<![">])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-md__link">$1</a>'
  );
  return result;
};

export const renderMessageMarkdown = (text: string): string => {
  const lines = text.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    if (!inCodeBlock && line.startsWith('```')) {
      inCodeBlock = true;
      codeBlockLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }
    if (inCodeBlock && line.startsWith('```')) {
      inCodeBlock = false;
      const langAttr = codeBlockLang ? ` data-lang="${escapeHtml(codeBlockLang)}"` : '';
      html.push(
        `<pre class="chat-md__pre"${langAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
      );
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    // Empty line → paragraph break
    if (line.trim() === '') {
      html.push('<br/>');
      continue;
    }
    html.push(`<p class="chat-md__p">${renderInline(line)}</p>`);
  }

  // Unclosed code block
  if (inCodeBlock) {
    html.push(
      `<pre class="chat-md__pre"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
    );
  }

  return html.join('\n');
};

type MessageMarkdownProps = {
  text: string;
};

export const MessageMarkdown = ({ text }: MessageMarkdownProps) => (
  <div
    className="chat-md"
    dangerouslySetInnerHTML={{ __html: renderMessageMarkdown(text) }}
  />
);
