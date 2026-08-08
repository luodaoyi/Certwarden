import type { CheckJobEvent } from "@/lib/types";

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
  const response = await authenticatedFetch(path, { ...init, headers }, retry);

  if (!response.ok) {
    const message = await readError(response);
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function streamCheckJobEvents(
  jobID: string,
  onEvent: (event: CheckJobEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let lastEventID = 0;
  let completed = false;

  while (!completed) {
    const headers = new Headers({ Accept: "text/event-stream" });
    if (lastEventID > 0) {
      headers.set("Last-Event-ID", String(lastEventID));
    }
    const response = await authenticatedFetch(`/check-jobs/${jobID}/events`, { headers, signal });
    if (!response.ok) {
      throw new ApiError(response.status, await readError(response));
    }
    if (!response.body) {
      throw new ApiError(response.status, "Streaming response is unavailable");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const normalized = buffer.replaceAll("\r\n", "\n");
      const blocks = normalized.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const parsed = parseSSEBlock(block);
        if (!parsed) continue;
        lastEventID = Math.max(lastEventID, parsed.id);
        onEvent(parsed);
        if (parsed.type === "job.completed") {
          completed = true;
        }
      }
      if (done) break;
    }

    if (!completed) {
      await waitForReconnect(signal);
    }
  }
}

async function authenticatedFetch(path: string, init?: RequestInit, retry = true): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
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
      return authenticatedFetch(path, init, false);
    }
  }
  return response;
}

function parseSSEBlock(block: string): CheckJobEvent | null {
  let id = 0;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) {
      id = Number.parseInt(line.slice(3).trim(), 10);
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (!Number.isFinite(id) || data.length === 0) return null;
  return { ...(JSON.parse(data.join("\n")) as CheckJobEvent), id };
}

function waitForReconnect(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, 1000);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
