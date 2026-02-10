import { getToken, clearToken, setToken } from "./auth";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function handle401(res: Response) {
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
  }
}

async function request(url: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${url}`, {
    headers: authHeaders(),
    ...options,
  });
  if (!res.ok) {
    handle401(res);
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// Auth
export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Login failed");
  }
  const data = await res.json();
  setToken(data.token);
  return data;
}

// Posts
export function fetchPosts(params: {
  status?: string;
  channelId?: number;
  isHistorical?: boolean;
  since?: string;
  page?: number;
}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.channelId) query.set("channelId", String(params.channelId));
  if (params.isHistorical !== undefined) query.set("isHistorical", String(params.isHistorical));
  if (params.since) query.set("since", params.since);
  if (params.page) query.set("page", String(params.page));
  return request(`/posts?${query}`);
}

export function fetchPost(id: number) {
  return request(`/posts/${id}`);
}

export function updatePost(id: number, translatedText: string) {
  return request(`/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify({ translatedText }),
  });
}

export function approvePost(id: number) {
  return request(`/posts/${id}/approve`, { method: "POST" });
}

export function rejectPost(id: number) {
  return request(`/posts/${id}/reject`, { method: "POST" });
}

export function publishPost(id: number) {
  return request(`/posts/${id}/publish`, { method: "POST" });
}

export function deletePost(id: number) {
  return request(`/posts/${id}`, { method: "DELETE" });
}

export function resetPost(id: number) {
  return request(`/posts/${id}/reset`, { method: "POST" });
}

export function translatePost(id: number, force = false) {
  const query = force ? "?force=true" : "";
  return request(`/posts/${id}/translate${query}`, { method: "POST" });
}

// Channel history (SSE)
export function fetchChannelHistory(
  channelId: number,
  onProgress: (p: { fetched: number; saved: number; skipped: number; done: boolean; error?: string }) => void,
  options?: { since?: string }
): { cancel: () => void } {
  const ctrl = new AbortController();
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  fetch(`${BASE}/channels/${channelId}/fetch-history`, {
    method: "POST",
    headers,
    body: JSON.stringify({ since: options?.since }),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (res.status === 401) {
      handle401(res);
      onProgress({ fetched: 0, saved: 0, skipped: 0, done: true, error: "Authentication required" });
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      onProgress({ fetched: 0, saved: 0, skipped: 0, done: true, error: err.error });
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try { onProgress(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  }).catch((err) => {
    if (err.name !== "AbortError") {
      onProgress({ fetched: 0, saved: 0, skipped: 0, done: true, error: err.message });
    }
  });
  return { cancel: () => ctrl.abort() };
}

// Telegram Dialogs
export function fetchTelegramDialogs() {
  return request("/telegram/dialogs");
}


// Telegram Avatar
export function telegramAvatarUrl(id: string): string {
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BASE}/telegram/avatar/${id}${tokenParam}`;
}

// Channels
export function fetchChannels() {
  return request("/channels");
}

export function addChannel(username: string, title?: string) {
  return request("/channels", {
    method: "POST",
    body: JSON.stringify({ username, title }),
  });
}

export function updateChannelTarget(id: number, targetChannelId: string) {
  return request(`/channels/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ targetChannelId }),
  });
}

export function deleteChannel(id: number) {
  return request(`/channels/${id}`, { method: "DELETE" });
}

// Media
export function mediaUrl(id: number) {
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BASE}/media/${id}${tokenParam}`;
}

export async function uploadMedia(postId: number, file: File) {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/posts/${postId}/media`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    handle401(res);
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}

export async function deleteMedia(id: number) {
  return request(`/media/${id}`, { method: "DELETE" });
}
