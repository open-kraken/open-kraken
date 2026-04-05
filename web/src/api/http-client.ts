export type HttpErrorEnvelope = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
  status: number;
};

export class HttpClientError extends Error {
  constructor(readonly envelope: HttpErrorEnvelope) {
    super(envelope.message);
    this.name = 'HttpClientError';
  }
}

export type HttpClientOptions = {
  baseUrl: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
  requestIdFactory?: () => string;
};

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const normalizeUrl = (baseUrl: string, path: string) => {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString();
};

const defaultRequestIdFactory = () => {
  const randomValue = Math.random().toString(36).slice(2, 10);
  return `req_${randomValue}`;
};

const classifyStatusCode = (status: number) => {
  switch (status) {
    case 401:
      return {
        code: 'unauthorized',
        message: 'Authentication is required before this request can continue.'
      };
    case 403:
      return {
        code: 'forbidden',
        message: 'The current role is not allowed to perform this action.'
      };
    case 409:
      return {
        code: 'conflict',
        message: 'The resource changed on the server and must be refreshed before retrying.'
      };
    default:
      if (status >= 500) {
        return {
          code: 'server_error',
          message: 'The server could not complete the request.'
        };
      }
      return {
        code: 'request_failed',
        message: 'The request failed.'
      };
  }
};

const parseErrorEnvelope = async (response: Response, requestId: string): Promise<HttpErrorEnvelope> => {
  const statusFallback = classifyStatusCode(response.status);

  try {
    const body = (await response.json()) as Partial<HttpErrorEnvelope>;
    return {
      code: body.code ?? statusFallback.code,
      message: body.message ?? statusFallback.message,
      requestId: body.requestId ?? requestId,
      details: body.details,
      status: response.status
    };
  } catch {
    return {
      ...statusFallback,
      requestId,
      details: undefined,
      status: response.status
    };
  }
};

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;
  /** Workspace id for X-Workspace-Id; also used to build /workspaces/{id}/… paths in the API client. */
  readonly workspaceId: string;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestIdFactory;
    this.workspaceId = options.workspaceId;
  }

  get<T>(path: string, init?: Omit<RequestOptions, 'body' | 'method'>) {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, init?: Omit<RequestOptions, 'body' | 'method'>) {
    return this.request<T>(path, { ...init, method: 'POST', body });
  }

  patch<T>(path: string, body: unknown, init?: Omit<RequestOptions, 'body' | 'method'>) {
    return this.request<T>(path, { ...init, method: 'PATCH', body });
  }

  async request<T>(path: string, init: RequestOptions): Promise<T> {
    const requestId = this.requestIdFactory();
    const response = await this.fetchImpl(normalizeUrl(this.options.baseUrl, path), {
      ...init,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        'X-Workspace-Id': this.options.workspaceId,
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new HttpClientError(await parseErrorEnvelope(response, requestId));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
