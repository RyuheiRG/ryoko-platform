import { type TokenResponse, tokenResponseSchema } from "./schemas";

const CONTENT_BASE = (import.meta.env.VITE_CONTENT_API_URL ?? "").replace(/\/+$/, "");
const WEBHOOK_BASE = (import.meta.env.VITE_WEBHOOK_API_URL ?? "/webhook-api").replace(/\/+$/, "");
const METRICS_URL = import.meta.env.VITE_METRICS_API_URL ?? "/metrics-api/graphql";

const STORAGE_KEY = "ryoko.cms.session";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: TokenResponse["user"];
}

type SessionListener = (session: StoredSession | null) => void;

const listeners = new Set<SessionListener>();
let cached: StoredSession | null | undefined;

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.user !== "object" ||
      parsed.user === null
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function getSession(): StoredSession | null {
  if (cached === undefined) {
    cached = readStoredSession();
  }
  return cached;
}

export function setSession(session: StoredSession | null): void {
  cached = session;
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the in-memory session still works.
  }
  for (const listener of listeners) {
    listener(session);
  }
}

export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toSession(response: TokenResponse): StoredSession {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    user: response.user,
  };
}

export class ProblemError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly errors: Array<{ field?: string; message: string }>;

  constructor(
    status: number,
    title: string,
    detail: string,
    errors: Array<{ field?: string; message: string }> = [],
  ) {
    super(
      errors.length > 0
        ? `${detail} (${errors.map((item) => item.field ?? item.message).join(", ")})`
        : detail,
    );
    this.name = "ProblemError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
  }
}

function problemFromBody(body: unknown, status: number): ProblemError {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "Error";
    const detail =
      typeof record.detail === "string" ? record.detail : `La solicitud falló (${status}).`;
    const errors = Array.isArray(record.errors)
      ? record.errors.flatMap((item) => {
          if (typeof item !== "object" || item === null) return [];
          const entry = item as Record<string, unknown>;
          const message = typeof entry.message === "string" ? entry.message : "Valor inválido";
          return [
            {
              field: typeof entry.field === "string" ? entry.field : undefined,
              message,
            },
          ];
        })
      : [];
    return new ProblemError(status, title, detail, errors);
  }
  return new ProblemError(status, "Error", `La solicitud falló (${status}).`);
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function checked<T>(response: Response): Promise<T> {
  const body = await parseBody(response);
  if (!response.ok) {
    throw problemFromBody(body, response.status);
  }
  return body as T;
}

export function contentUrl(path: string): string {
  return `${CONTENT_BASE}${path}`;
}

export function webhookUrl(path: string): string {
  return `${WEBHOOK_BASE}${path}`;
}

let refreshPromise: Promise<StoredSession> | null = null;

async function performRefresh(): Promise<StoredSession> {
  const current = getSession();
  if (!current) {
    throw new ProblemError(401, "Unauthorized", "No hay una sesión activa.");
  }
  const response = await fetch(contentUrl("/v1/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    setSession(null);
    throw problemFromBody(body, response.status);
  }
  const parsed = tokenResponseSchema.parse(body);
  const next = toSession(parsed);
  setSession(next);
  return next;
}

export function refreshSession(): Promise<StoredSession> {
  if (!refreshPromise) {
    refreshPromise = performRefresh();
    void refreshPromise
      .catch(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function accessToken(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  if (session.expiresAt - 30_000 <= Date.now()) {
    try {
      return (await refreshSession()).accessToken;
    } catch {
      return null;
    }
  }
  return session.accessToken;
}

async function request<T>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && token && !retried) {
    try {
      const refreshed = await refreshSession();
      headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
      return checked<T>(await fetch(url, { ...init, headers }));
    } catch {
      setSession(null);
    }
  }
  return checked<T>(response);
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(contentUrl(path));
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(contentUrl(path), jsonInit("POST", body));
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(contentUrl(path), jsonInit("PUT", body));
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(contentUrl(path), jsonInit("PATCH", body));
  },
  delete<T = null>(path: string): Promise<T> {
    return request<T>(contentUrl(path), { method: "DELETE" });
  },
  upload<T>(path: string, form: FormData, method = "POST"): Promise<T> {
    return request<T>(contentUrl(path), { method, body: form });
  },
};

export const webhookApi = {
  get<T>(path: string): Promise<T> {
    return request<T>(webhookUrl(path));
  },
  post<T>(path: string): Promise<T> {
    return request<T>(webhookUrl(path), { method: "POST" });
  },
};

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await request<GraphQLResponse<T>>(METRICS_URL, jsonInit("POST", { query, variables }));
  if (response.errors && response.errors.length > 0) {
    throw new Error(response.errors[0]?.message ?? "GraphQL error");
  }
  if (!response.data) {
    throw new Error("La Metrics API no devolvió datos.");
  }
  return response.data;
}

export async function login(email: string, password: string): Promise<StoredSession> {
  const form = new URLSearchParams({ username: email, password });
  const response = await fetch(contentUrl("/v1/auth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw problemFromBody(body, response.status);
  }
  const parsed = tokenResponseSchema.parse(body);
  const session = toSession(parsed);
  setSession(session);
  return session;
}

export async function logout(): Promise<void> {
  const session = getSession();
  if (session) {
    try {
      await fetch(contentUrl("/v1/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
    } catch {
      // Revoking the refresh token is best-effort; the local session is cleared anyway.
    }
  }
  setSession(null);
}
