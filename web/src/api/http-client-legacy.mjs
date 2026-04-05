export const createHttpClient = ({ apiBaseUrl, fetchImpl = fetch }) => ({
  async request(path, init) {
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
