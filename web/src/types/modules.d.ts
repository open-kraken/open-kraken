declare module '*.mjs' {
  export const createApiClient: any;
  export const createMockClient: any;
  const value: any;
  export = value;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
