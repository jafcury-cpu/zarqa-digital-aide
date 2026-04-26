// Per-device log of recent realtime connection transitions, capped at MAX entries.
// Stored in localStorage so it survives reloads and is shareable between tabs.

export type RealtimeLogKind = "connecting" | "connected" | "disconnected" | "error" | "paused" | "manual";

export type RealtimeLogEntry = {
  at: number; // epoch ms
  kind: RealtimeLogKind;
  reason: string;
};

const KEY = "luize.chat.realtimeLog";
const MAX = 10;
const EVENT = "luize:chat-realtime-log-changed";

function read(): RealtimeLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is RealtimeLogEntry =>
          entry &&
          typeof entry.at === "number" &&
          typeof entry.reason === "string" &&
          typeof entry.kind === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(entries: RealtimeLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore quota */
  }
}

export function getRealtimeLog(): RealtimeLogEntry[] {
  return read();
}

export function appendRealtimeLog(kind: RealtimeLogKind, reason: string): void {
  const next: RealtimeLogEntry = { at: Date.now(), kind, reason };
  const current = read();
  // De-duplicate: skip if last entry has the same kind+reason within 1.5s (debounce noise)
  const last = current[0];
  if (last && last.kind === kind && last.reason === reason && Date.now() - last.at < 1500) return;
  write([next, ...current]);
}

export function clearRealtimeLog(): void {
  write([]);
}

export const REALTIME_LOG_EVENT = EVENT;
export const REALTIME_LOG_KEY = KEY;
export const REALTIME_LOG_MAX = MAX;
