// Debug mode: capture detailed Supabase / validation / RLS errors
// and show them in a floating panel without opening DevTools.

export type DebugLevel = "error" | "warn" | "info";

export type DebugEntry = {
  id: string;
  at: number;
  level: DebugLevel;
  source: string;
  message: string;
  details?: unknown;
};

const ENABLED_KEY = "luize:debug-mode-enabled";
const ENTRIES_KEY = "luize:debug-mode-entries";
const MAX_ENTRIES = 100;

export const DEBUG_MODE_CHANGED_EVENT = "luize:debug-mode-changed";
export const DEBUG_ENTRY_ADDED_EVENT = "luize:debug-entry-added";

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function isDebugModeEnabled(): boolean {
  return safeRead<boolean>(ENABLED_KEY, false);
}

export function setDebugModeEnabled(enabled: boolean) {
  safeWrite(ENABLED_KEY, enabled);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEBUG_MODE_CHANGED_EVENT, { detail: enabled }));
  }
}

export function getDebugEntries(): DebugEntry[] {
  return safeRead<DebugEntry[]>(ENTRIES_KEY, []);
}

export function clearDebugEntries() {
  safeWrite(ENTRIES_KEY, []);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEBUG_ENTRY_ADDED_EVENT));
  }
}

function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function pushDebug(entry: Omit<DebugEntry, "id" | "at">) {
  if (!isDebugModeEnabled()) return;
  const list = getDebugEntries();
  const next: DebugEntry = { ...entry, id: genId(), at: Date.now() };
  const updated = [next, ...list].slice(0, MAX_ENTRIES);
  safeWrite(ENTRIES_KEY, updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEBUG_ENTRY_ADDED_EVENT, { detail: next }));
  }
}

// Helper specifically for Supabase PostgrestError-shaped errors.
export function pushSupabaseError(source: string, error: unknown, context?: Record<string, unknown>) {
  if (!error) return;
  const e = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
  };
  const isRls =
    typeof e.message === "string" &&
    /row-level security|violates row-level/i.test(e.message);
  pushDebug({
    level: "error",
    source: isRls ? `${source} (RLS)` : source,
    message: e.message || "Erro desconhecido do Supabase",
    details: {
      code: e.code,
      details: e.details,
      hint: e.hint,
      status: e.status,
      ...context,
    },
  });
}
