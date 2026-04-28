export const acceptsTerminalHash = (raw: string) => /^[A-Za-z0-9._:-]+$/.test(raw.trim());

export const decodeTerminalHash = (hash: string) => {
  const raw = hash.replace(/^#/, '').trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
