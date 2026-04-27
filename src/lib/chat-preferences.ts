// Per-device chat preferences stored in localStorage so they survive reloads
// and can be toggled cross-tab via the `storage` event.

export const REALTIME_TOAST_PREF_KEY = "luize.chat.realtimeToastsMuted";
export const REALTIME_TOAST_SEVERITY_KEY = "luize.chat.realtimeToastSeverity";
export const CHAT_PREFS_CHANGED_EVENT = "luize:chat-prefs-changed";
export const REALTIME_EVENT_LOG_KEY = "luize.chat.realtimeEventLog";
export const REALTIME_EVENT_LOG_CHANGED_EVENT = "luize:chat-realtime-log-changed";
export const REALTIME_EVENT_LOG_MAX = 10;
export const REALTIME_STATUS_SNAPSHOT_KEY = "luize.chat.realtimeStatusSnapshot";
export const REALTIME_STATUS_SNAPSHOT_CHANGED_EVENT = "luize:chat-realtime-status-changed";

// Per-tab id used to detect cross-tab transitions vs. local ones.
let TAB_ID: string | null = null;
export function getTabId(): string {
  if (TAB_ID) return TAB_ID;
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem("luize.chat.tabId");
    if (existing) {
      TAB_ID = existing;
      return TAB_ID;
    }
    const fresh = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem("luize.chat.tabId", fresh);
    TAB_ID = fresh;
    return TAB_ID;
  } catch {
    TAB_ID = `tab-${Math.random().toString(36).slice(2, 10)}`;
    return TAB_ID;
  }
}

export type RealtimeToastSeverity = "all" | "warnings_and_errors" | "errors_only" | "none";
export const REALTIME_TOAST_SEVERITIES: RealtimeToastSeverity[] = [
  "all",
  "warnings_and_errors",
  "errors_only",
  "none",
];

const DEFAULT_SEVERITY: RealtimeToastSeverity = "all";

function isValidSeverity(value: string | null): value is RealtimeToastSeverity {
  return value !== null && (REALTIME_TOAST_SEVERITIES as string[]).includes(value);
}

export function getRealtimeToastSeverity(): RealtimeToastSeverity {
  if (typeof window === "undefined") return DEFAULT_SEVERITY;
  try {
    const explicit = window.localStorage.getItem(REALTIME_TOAST_SEVERITY_KEY);
    if (isValidSeverity(explicit)) return explicit;
    // Backward compatibility: legacy boolean "muted" flag → "none"
    if (window.localStorage.getItem(REALTIME_TOAST_PREF_KEY) === "1") return "none";
    return DEFAULT_SEVERITY;
  } catch {
    return DEFAULT_SEVERITY;
  }
}

export function setRealtimeToastSeverity(severity: RealtimeToastSeverity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REALTIME_TOAST_SEVERITY_KEY, severity);
    // Keep legacy mute flag in sync so anything still reading it behaves correctly
    window.localStorage.setItem(REALTIME_TOAST_PREF_KEY, severity === "none" ? "1" : "0");
    window.dispatchEvent(new CustomEvent(CHAT_PREFS_CHANGED_EVENT));
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

/**
 * Decide whether a toast for a given realtime status transition should be shown
 * under the current severity preference.
 *  - "all": connecting (info), connected (success), disconnected (warning), error (error)
 *  - "warnings_and_errors": disconnected + error
 *  - "errors_only": error
 *  - "none": nothing
 */
export function shouldShowRealtimeToast(
  severity: RealtimeToastSeverity,
  status: PersistedRealtimeStatus,
): boolean {
  if (severity === "none") return false;
  if (severity === "errors_only") return status === "error";
  if (severity === "warnings_and_errors") return status === "error" || status === "disconnected";
  // "all": show every transition we already toast (skip "paused" — it has its own dedicated UI)
  return status !== "paused";
}

export type PersistedRealtimeStatus = "connecting" | "connected" | "disconnected" | "error" | "paused";
export type PersistedRealtimeEvent = {
  at: number;
  status: PersistedRealtimeStatus;
  reason: string;
  /** Tab that produced this event. Used to detect cross-tab transitions. */
  tabId?: string;
};

export type PersistedRealtimeStatusSnapshot = {
  status: PersistedRealtimeStatus;
  reason: string;
  at: number;
  tabId: string;
};

const VALID_STATUSES: PersistedRealtimeStatus[] = ["connecting", "connected", "disconnected", "error", "paused"];

function isPersistedEvent(value: unknown): value is PersistedRealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.at === "number" &&
    Number.isFinite(v.at) &&
    typeof v.reason === "string" &&
    typeof v.status === "string" &&
    VALID_STATUSES.includes(v.status as PersistedRealtimeStatus)
  );
}

export function getRealtimeEventLog(): PersistedRealtimeEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REALTIME_EVENT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPersistedEvent).slice(-REALTIME_EVENT_LOG_MAX);
  } catch {
    return [];
  }
}

export function setRealtimeEventLog(events: PersistedRealtimeEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = events.slice(-REALTIME_EVENT_LOG_MAX);
    window.localStorage.setItem(REALTIME_EVENT_LOG_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT_LOG_CHANGED_EVENT));
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

export function clearRealtimeEventLog(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REALTIME_EVENT_LOG_KEY);
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT_LOG_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

function isSnapshot(value: unknown): value is PersistedRealtimeStatusSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.status === "string" &&
    VALID_STATUSES.includes(v.status as PersistedRealtimeStatus) &&
    typeof v.reason === "string" &&
    typeof v.at === "number" &&
    Number.isFinite(v.at) &&
    typeof v.tabId === "string"
  );
}

export function getRealtimeStatusSnapshot(): PersistedRealtimeStatusSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REALTIME_STATUS_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setRealtimeStatusSnapshot(snapshot: PersistedRealtimeStatusSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REALTIME_STATUS_SNAPSHOT_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(REALTIME_STATUS_SNAPSHOT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REALTIME_TOAST_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRealtimeToastsMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REALTIME_TOAST_PREF_KEY, muted ? "1" : "0");
    // Notify same-tab listeners (storage event only fires across tabs)
    window.dispatchEvent(new CustomEvent(CHAT_PREFS_CHANGED_EVENT));
  } catch {
    /* ignore quota / privacy mode errors */
  }
}
