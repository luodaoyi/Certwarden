type RefreshFn = () => Promise<string | null>;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

let accessToken: string | null = null;
let refreshHandler: RefreshFn | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setRefreshHandler(handler: RefreshFn | null) {
  refreshHandler = handler;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", "Bearer " + accessToken);
  }

  const response = await fetch(API_BASE + path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry && refreshHandler) {
    const refreshed = await refreshHandler();
    if (refreshed) {
      return apiRequest<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const message = await readError(response);
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
