export type LegacyHttpClient = {
  request: (path: string, init?: RequestInit) => Promise<unknown>;
};

type CreateHttpClientOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  authToken?: string;
};

export const createHttpClient = ({ apiBaseUrl, fetchImpl = fetch, authToken }: CreateHttpClientOptions): LegacyHttpClient => ({
  async request(path: string, init?: RequestInit) {
    const authHeaders: Record<string, string> = authToken ? { Authorization: authToken } : {};
    const response = await fetchImpl(new URL(path, `${apiBaseUrl}/`).toString(), {
      headers: { 'content-type': 'application/json', ...authHeaders, ...(init?.headers ?? {}) },
      ...init
    });
    if (!response.ok) {
      throw new Error(`http ${response.status}`);
    }
    return response.json();
  }
});
