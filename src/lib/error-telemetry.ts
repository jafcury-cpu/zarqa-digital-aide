import { supabase } from "@/integrations/supabase/client";
import { pushDebug } from "./debug-mode";

export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorLogInput {
  message: string;
  stack?: string | null;
  source?: string;
  severity?: ErrorSeverity;
  route?: string;
  requestId?: string | null;
  context?: Record<string, unknown>;
}

const RECENT_KEY = "luize:error-telemetry:recent";
const MAX_RECENT = 50;
let initialized = false;

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

function pushLocalRecent(entry: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    window.dispatchEvent(new CustomEvent("luize:error-logged", { detail: entry }));
  } catch {
    /* ignore */
  }
}

export function getLocalRecentErrors(): Array<Record<string, unknown>> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearLocalRecentErrors() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_KEY);
  window.dispatchEvent(new CustomEvent("luize:error-logged"));
}

export async function logError(input: ErrorLogInput): Promise<void> {
  const requestId = input.requestId ?? generateRequestId();
  const route = input.route ?? getCurrentRoute();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const severity: ErrorSeverity = input.severity ?? "error";
  const source = input.source ?? "app";

  const localEntry = {
    message: input.message,
    stack: input.stack ?? null,
    source,
    severity,
    route,
    request_id: requestId,
    context: input.context ?? {},
    created_at: new Date().toISOString(),
  };
  pushLocalRecent(localEntry);

  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    await supabase.from("error_logs").insert({
      user_id: userId,
      message: input.message.slice(0, 2000),
      stack: input.stack ? input.stack.slice(0, 8000) : null,
      source,
      severity,
      route,
      user_agent: userAgent,
      request_id: requestId,
      context: (input.context ?? {}) as never,
    });
  } catch {
    /* swallow — never throw from telemetry */
  }
}

export function initErrorTelemetry() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    void logError({
      message: err?.message || event.message || "Unknown error",
      stack: err?.stack ?? null,
      source: "window.error",
      severity: "error",
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
    pushDebug({
      level: "error",
      source: "window.error",
      message: err?.message || event.message || "Unknown error",
      details: { stack: err?.stack, filename: event.filename, lineno: event.lineno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason);
    const stack = reason instanceof Error ? reason.stack : null;
    void logError({
      message: message || "Unhandled promise rejection",
      stack,
      source: "unhandledrejection",
      severity: "error",
    });
    pushDebug({
      level: "error",
      source: "unhandledrejection",
      message: message || "Unhandled promise rejection",
      details: { stack },
    });
  });

  // Patch fetch to capture failed Supabase HTTP calls (RLS, validation, 4xx/5xx)
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isSupabase = typeof url === "string" && url.includes(".supabase.co");
    try {
      const response = await origFetch(...args);
      if (isSupabase && !response.ok) {
        // Clone so we don't consume the original body
        try {
          const clone = response.clone();
          const text = await clone.text();
          let body: unknown = text;
          try { body = JSON.parse(text); } catch { /* keep raw text */ }
          const isRest = url.includes("/rest/v1/");
          const isFn = url.includes("/functions/v1/");
          pushDebug({
            level: "error",
            source: isFn ? "supabase.fn" : isRest ? "supabase.rest" : "supabase.http",
            message: `HTTP ${response.status} · ${(init?.method ?? "GET").toUpperCase()} ${url.split(".supabase.co")[1] ?? url}`,
            details: { status: response.status, body },
          });
        } catch {
          /* ignore inspection errors */
        }
      }
      return response;
    } catch (err) {
      if (isSupabase) {
        pushDebug({
          level: "error",
          source: "supabase.network",
          message: err instanceof Error ? err.message : String(err),
          details: { url },
        });
      }
      throw err;
    }
  };

  // Patch console.error to capture React/dev errors too
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const first = args[0];
      // Skip noisy React dev warnings (start with "Warning:")
      const isReactWarning =
        typeof first === "string" && first.startsWith("Warning:");
      if (!isReactWarning) {
        const message = args
          .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a)))
          .join(" ")
          .slice(0, 500);
        const stack = args.find((a) => a instanceof Error) as Error | undefined;
        void logError({
          message,
          stack: stack?.stack ?? null,
          source: "console.error",
          severity: "error",
        });
      }
    } catch {
      /* ignore */
    }
    origError.apply(console, args as never);
  };
}
