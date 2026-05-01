export type HttpErrorEnvelope = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
  status: number;
  retryable?: boolean;
};

export class HttpClientError extends Error {
  constructor(readonly envelope: HttpErrorEnvelope) {
    super(envelope.message);
    this.name = 'HttpClientError';
  }
}

import { appEnv } from '../config/env';
import { newTraceparentValue } from '../observability/trace-context';

export type HttpClientOptions = {
  baseUrl: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
  requestIdFactory?: () => string;
  /** Bearer token for Authorization header. */
  authToken?: string;
  /** Request timeout in milliseconds. Defaults to 30 000 (30 s). */
  timeoutMs?: number;
  /**
   * When true (default), send W3C traceparent for OpenTelemetry/Langfuse. Override to disable per client.
   */
  traceContext?: boolean;
};

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const normalizeUrl = (baseUrl: string, path: string) => {
  // Strip leading slash so `new URL` appends to base path instead of replacing it.
  // e.g. baseUrl="http://host/api/v1", path="/nodes" → "http://host/api/v1/nodes"
  const relative = path.replace(/^\/+/, '');
  return new URL(relative, `${baseUrl.replace(/\/+$/, '')}/`).toString();
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
    const body = (await response.json()) as Partial<HttpErrorEnvelope> & {
      error?: string | Partial<HttpErrorEnvelope>;
    };
    const nested = body.error && typeof body.error === 'object' ? body.error : undefined;
    return {
      code: body.code ?? nested?.code ?? statusFallback.code,
      message:
        body.message ??
        nested?.message ??
        (typeof body.error === 'string' ? body.error : statusFallback.message),
      requestId: body.requestId ?? nested?.requestId ?? requestId,
      details: body.details ?? nested?.details,
      status: response.status,
      retryable: body.retryable ?? nested?.retryable,
    };
  } catch {
    return {
      ...statusFallback,
      requestId,
      details: undefined,
      status: response.status,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500
    };
  }
};

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;
  private readonly traceContext: boolean;
  /** Workspace id for X-Workspace-Id; also used to build /workspaces/{id}/… paths in the API client. */
  readonly workspaceId: string;

  constructor(private readonly options: HttpClientOptions) {
    // Bind so native `fetch` is never invoked as an unbound method (Illegal invocation in some runtimes).
    this.fetchImpl =
      options.fetchImpl ??
      ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestIdFactory;
    this.workspaceId = options.workspaceId;
    this.traceContext = options.traceContext ?? appEnv.browserTraceContext;
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
    const timeoutMs = this.options.timeoutMs ?? 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(normalizeUrl(this.options.baseUrl, path), {
        ...init,
        signal: controller.signal,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
          'X-Workspace-Id': this.options.workspaceId,
          ...(this.traceContext ? { traceparent: newTraceparentValue() } : {}),
          ...(this.options.authToken ? { Authorization: this.options.authToken } : {}),
          ...init.headers
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new HttpClientError({
          code: 'timeout',
          message: `Request timed out after ${timeoutMs}ms`,
          requestId,
          status: 0
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new HttpClientError(await parseErrorEnvelope(response, requestId));
    }

    if (response.status === 204) {
      // Return undefined — callers that expect a body should not use methods
      // that may return 204 with a non-void T.
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  }
}
