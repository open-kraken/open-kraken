/**
 * Derive monospace CLI preview lines from workspace fixture terminalSessions (local dev / fixture mode).
 */
export const buildCliPreviewLinesFromFixture = (
  fixture: { terminalSessions?: Array<Record<string, unknown>> } | null
): Record<string, string[]> => {
  if (!fixture?.terminalSessions || !Array.isArray(fixture.terminalSessions)) {
    return {};
  }
  const out: Record<string, string[]> = {};
  for (const raw of fixture.terminalSessions) {
    const memberId = typeof raw.memberId === 'string' ? raw.memberId : '';
    if (!memberId) continue;
    const command = typeof raw.command === 'string' ? raw.command : '';
    const status = typeof raw.status === 'string' ? raw.status : '';
    const snapshot = raw.snapshot as { buffer?: { data?: string } } | undefined;
    const data = typeof snapshot?.buffer?.data === 'string' ? snapshot.buffer.data : '';
    const tail = data
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .slice(0, 5);
    const lines: string[] = [];
    if (command) lines.push(`$ ${command}`);
    if (status) lines.push(`process: ${status}`);
    for (const line of tail) {
      if (!lines.includes(line)) {
        lines.push(line);
      }
    }
    if (lines.length === 0) {
      lines.push('$ —', '(no snapshot buffer in fixture)');
    }
    out[memberId] = lines.slice(0, 8);
  }
  return out;
};
