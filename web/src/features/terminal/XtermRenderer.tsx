/**
 * XtermRenderer — wraps @xterm/xterm for ANSI-aware terminal rendering.
 * Replaces the plain <pre> tag with a real terminal emulator that supports
 * colors, cursor positioning, scrollback, and resize.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

type XtermRendererProps = {
  /** Accumulated output text to write. When this changes, new data is appended. */
  outputText: string;
  /** Follow output (auto-scroll to bottom). */
  followOutput?: boolean;
  /** Called when user types in the terminal. */
  onInput?: (data: string) => void;
  /** Called when the terminal resizes. */
  onResize?: (cols: number, rows: number) => void;
  /** Called after rendering output to ACK bytes for flow control. */
  onAckBytes?: (n: number) => void;
  /** Intelligence status for the status bar indicator. */
  intelligenceStatus?: 'connecting' | 'online' | 'working' | 'offline';
  /** Whether the shell is ready for input. */
  shellReady?: boolean;
};

export const XtermRenderer = ({
  outputText,
  followOutput = true,
  onInput,
  onResize,
  onAckBytes,
  intelligenceStatus = 'connecting',
  shellReady = false,
}: XtermRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastWrittenLength = useRef(0);

  // Initialize xterm on mount.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: 'var(--app-font-mono, "JetBrains Mono", monospace)',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        cursor: '#3ecfae',
        selectionBackground: 'rgba(62, 207, 174, 0.25)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      scrollback: 5000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);

    // Fit to container.
    try { fitAddon.fit(); } catch { /* container may not be ready */ }

    // Handle user input.
    term.onData((data) => {
      onInput?.(data);
    });

    // Handle resize.
    term.onResize(({ cols, rows }) => {
      onResize?.(cols, rows);
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    // Observe container resizes.
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);  // Mount only

  // Write new output when outputText changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newData = outputText.slice(lastWrittenLength.current);
    if (newData.length > 0) {
      term.write(newData);
      lastWrittenLength.current = outputText.length;

      // ACK bytes for flow control.
      onAckBytes?.(newData.length);

      // Auto-scroll.
      if (followOutput) {
        term.scrollToBottom();
      }
    }
  }, [outputText, followOutput, onAckBytes]);

  return (
    <div className="xterm-renderer" data-intelligence-status={intelligenceStatus}>
      <div className="xterm-renderer__toolbar">
        <span className="xterm-renderer__status" data-intelligence-status={intelligenceStatus}>
          {intelligenceStatus === 'working' ? 'Working' :
           intelligenceStatus === 'online' ? 'Online' :
           intelligenceStatus === 'offline' ? 'Offline' : 'Connecting'}
        </span>
        {!shellReady && intelligenceStatus === 'connecting' && (
          <span className="xterm-renderer__hint">Waiting for shell...</span>
        )}
      </div>
      <div ref={containerRef} className="xterm-renderer__container" />
    </div>
  );
};
