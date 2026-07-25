"use client";

import { sessionStore } from "@/lib/client/state/session-store";

export interface ApiErrorBody {
  object?: string;
  code?: string;
  message?: string;
  validationErrors?: Record<string, string[]>;
  requestId?: string;
  [key: string]: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: ApiErrorBody,
    public readonly requestId: string | null
  ) {
    super(body.message || `Request failed with status ${status}.`);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: (error: ApiClientError) => void | Promise<void>;
  onConflict?: (error: ApiClientError) => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
}

function isBodyInit(body: NonNullable<ApiRequestOptions["body"]>): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof ReadableStream
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { message: "The server returned invalid JSON." };
    }
  }
  return text;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getAccessToken = options.getAccessToken ?? sessionStore.getAccessToken;

  return async function request<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const offlineSessionRefresh = path.split("?", 1)[0] === "/identity/connect/token";
    if (sessionStore.getSnapshot().readOnly && !offlineSessionRefresh && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      throw new ApiClientError(503, "offline_read_only", {
        object: "error",
        code: "offline_read_only",
        message: "Offline vault access is read-only.",
      }, null);
    }
    const headers = new Headers(init.headers);
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    headers.set("X-Vercelwarden-Client", "first-party-web");

    let body: BodyInit | null | undefined = init.body as BodyInit | null | undefined;
    if (init.body != null && !isBodyInit(init.body)) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }

    const response = await fetchImpl(new URL(path, options.baseUrl ?? window.location.origin), {
      ...init,
      body,
      headers,
      cache: "no-store",
      credentials: "include",
    });
    const parsed = await readResponseBody(response);

    if (!response.ok) {
      const errorBody: ApiErrorBody =
        parsed && typeof parsed === "object"
          ? (parsed as ApiErrorBody)
          : { message: typeof parsed === "string" ? parsed : response.statusText };
      const error = new ApiClientError(
        response.status,
        errorBody.code ?? (response.status === 401 ? "unauthorized" : "request_failed"),
        errorBody,
        response.headers.get("x-request-id") ?? errorBody.requestId ?? null
      );
      if (response.status === 401) await options.onUnauthorized?.(error);
      if (response.status === 409) await options.onConflict?.(error);
      throw error;
    }

    return parsed as T;
  };
}

export const apiClient = createApiClient({
  onUnauthorized: () => sessionStore.logout(),
});
