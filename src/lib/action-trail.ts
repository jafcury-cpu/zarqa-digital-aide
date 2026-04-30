// Tracks the last N user-visible actions (navigation, clicks on buttons/links)
// to give context when reporting a problem.

export type ActionEntry = {
  id: string;
  at: number;
  kind: "navigation" | "click" | "submit" | "custom";
  label: string;
  route?: string;
  details?: Record<string, unknown>;
};

const KEY = "luize:action-trail";
const MAX = 10;

function safeRead(): ActionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActionEntry[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(list: ActionEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
}

function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recordAction(entry: Omit<ActionEntry, "id" | "at">) {
  const list = safeRead();
  const next: ActionEntry = { ...entry, id: genId(), at: Date.now() };
  // Avoid duplicate consecutive navigations to same route
  if (entry.kind === "navigation" && list[0]?.kind === "navigation" && list[0].route === entry.route) return;
  safeWrite([next, ...list]);
}

export function getActionTrail(): ActionEntry[] {
  return safeRead();
}

export function clearActionTrail() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

let initialized = false;

export function initActionTrail() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Capture clicks on buttons / links anywhere
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const actionable = target.closest<HTMLElement>(
        'button, a, [role="button"], [role="menuitem"], [role="tab"]',
      );
      if (!actionable) return;
      const label =
        actionable.getAttribute("aria-label")?.trim() ||
        actionable.textContent?.trim().slice(0, 80) ||
        actionable.getAttribute("title")?.trim() ||
        actionable.tagName.toLowerCase();
      if (!label) return;
      recordAction({
        kind: "click",
        label,
        route: window.location.pathname,
        details: { tag: actionable.tagName.toLowerCase() },
      });
    },
    { capture: true, passive: true },
  );

  // Capture form submits
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      recordAction({
        kind: "submit",
        label: form.getAttribute("aria-label") || form.id || "form submit",
        route: window.location.pathname,
      });
    },
    { capture: true, passive: true },
  );

  // Capture initial route
  recordAction({ kind: "navigation", label: window.location.pathname, route: window.location.pathname });

  // Patch history to capture SPA navigations
  const patch = (method: "pushState" | "replaceState") => {
    const orig = history[method];
    history[method] = function (...args: Parameters<typeof orig>) {
      const result = orig.apply(this, args);
      const route = window.location.pathname;
      recordAction({ kind: "navigation", label: route, route });
      return result;
    } as typeof orig;
  };
  patch("pushState");
  patch("replaceState");
  window.addEventListener("popstate", () => {
    const route = window.location.pathname;
    recordAction({ kind: "navigation", label: route, route });
  });
}
