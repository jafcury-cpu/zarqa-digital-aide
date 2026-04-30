import { useEffect, useMemo, useState } from "react";
import { Bug, ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  clearDebugEntries,
  DEBUG_ENTRY_ADDED_EVENT,
  DEBUG_MODE_CHANGED_EVENT,
  getDebugEntries,
  isDebugModeEnabled,
  setDebugModeEnabled,
  type DebugEntry,
} from "@/lib/debug-mode";

const levelStyles: Record<DebugEntry["level"], string> = {
  error: "border-destructive/40 bg-destructive/10",
  warn: "border-amber-500/40 bg-amber-500/10",
  info: "border-border bg-panel-elevated",
};

const levelBadge: Record<DebugEntry["level"], "destructive" | "warning" | "info"> = {
  error: "destructive",
  warn: "warning",
  info: "info",
};

function fmtTime(at: number) {
  return new Date(at).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
}

export function DebugOverlay() {
  const [enabled, setEnabled] = useState(() => isDebugModeEnabled());
  const [entries, setEntries] = useState<DebugEntry[]>(() => getDebugEntries());
  const [collapsed, setCollapsed] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const onMode = () => setEnabled(isDebugModeEnabled());
    const onEntry = () => setEntries(getDebugEntries());
    window.addEventListener(DEBUG_MODE_CHANGED_EVENT, onMode);
    window.addEventListener(DEBUG_ENTRY_ADDED_EVENT, onEntry);
    window.addEventListener("storage", onEntry);
    return () => {
      window.removeEventListener(DEBUG_MODE_CHANGED_EVENT, onMode);
      window.removeEventListener(DEBUG_ENTRY_ADDED_EVENT, onEntry);
      window.removeEventListener("storage", onEntry);
    };
  }, []);

  const errorCount = useMemo(() => entries.filter((e) => e.level === "error").length, [entries]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-3 sm:p-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Bug className="size-4 text-primary" />
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">Debug</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {entries.length}
            </Badge>
            {errorCount > 0 ? (
              <Badge variant="destructive" className="font-mono text-[10px]">
                {errorCount} err
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => clearDebugEntries()}
              disabled={entries.length === 0}
              className="h-7 px-2 text-[11px]"
              aria-label="Limpar entradas de debug"
            >
              <Trash2 className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((c) => !c)}
              className="h-7 px-2 text-[11px]"
              aria-label={collapsed ? "Expandir painel" : "Recolher painel"}
            >
              {collapsed ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDebugModeEnabled(false)}
              className="h-7 px-2 text-[11px]"
              aria-label="Desativar modo debug"
              title="Desativar modo debug"
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>

        {!collapsed ? (
          <div className="max-h-80 overflow-y-auto p-2">
            {entries.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Nenhum evento ainda. Erros de validação, RLS e Supabase aparecerão aqui.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {entries.map((entry) => {
                  const open = expandedId === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-[11px]",
                        levelStyles[entry.level],
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-2 text-left"
                        onClick={() => setExpandedId(open ? null : entry.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={levelBadge[entry.level]} className="text-[9px]">
                              {entry.level}
                            </Badge>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {entry.source}
                            </span>
                          </div>
                          <p className="mt-1 break-words font-mono text-foreground">
                            {entry.message}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {fmtTime(entry.at)}
                        </span>
                      </button>
                      {open && entry.details ? (
                        <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
