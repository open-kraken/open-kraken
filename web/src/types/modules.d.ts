declare module '*.mjs' {
  export const createApiClient: any;
  export const createMockClient: any;
  const value: any;
  export = value;
}

interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
