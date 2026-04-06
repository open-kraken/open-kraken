export type LegacyHttpClient = {
  request: (path: string, init?: RequestInit) => Promise<unknown>;
};

type CreateHttpClientOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export const createHttpClient = ({ apiBaseUrl, fetchImpl = fetch }: CreateHttpClientOptions): LegacyHttpClient => ({
  async request(path: string, init?: RequestInit) {
    const response = await fetchImpl(new URL(path, `${apiBaseUrl}/`).toString(), {
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      ...init
    });
    if (!response.ok) {
      throw new Error(`http ${response.status}`);
    }
    return response.json();
  }
});
