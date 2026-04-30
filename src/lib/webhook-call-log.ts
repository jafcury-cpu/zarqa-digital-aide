// In-memory + localStorage log of recent webhook calls (chat-webhook proxy).
// Stays local-only to avoid persisting potentially sensitive payloads.

export type WebhookCallEntry = {
  id: string;
  at: number;
  mode: "ping" | "message";
  durationMs: number;
  status: "success" | "error";
  httpStatus: number | null;
  errorMessage: string | null;
  request: unknown;
  response: unknown;
};

const KEY = "luize:webhook-call-log";
const MAX = 25;
export const WEBHOOK_LOG_CHANGED_EVENT = "luize:webhook-log-changed";

function read(): WebhookCallEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WebhookCallEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: WebhookCallEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent(WEBHOOK_LOG_CHANGED_EVENT));
  } catch {
    /* ignore quota errors */
  }
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function truncate(value: unknown, max = 8000): unknown {
  try {
    const json = JSON.stringify(value);
    if (json.length <= max) return value;
    return { __truncated: true, preview: json.slice(0, max) };
  } catch {
    return { __unserializable: String(value) };
  }
}

export function getWebhookCallLog(): WebhookCallEntry[] {
  return read();
}

export function clearWebhookCallLog(): void {
  write([]);
}

export function recordWebhookCall(entry: Omit<WebhookCallEntry, "id">): void {
  const full: WebhookCallEntry = {
    ...entry,
    id: genId(),
    request: truncate(entry.request),
    response: truncate(entry.response),
  };
  const next = [full, ...read()].slice(0, MAX);
  write(next);
}
