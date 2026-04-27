import { t } from "@/lib/i18n";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon, ChevronUp, Download, FilterX, History, Pause, Play, RefreshCw, SendHorizontal, Trash2, Radio } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/luize/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import {
  appendRealtimeEvent,
  CHAT_PREFS_CHANGED_EVENT,
  clearRealtimeEventLog,
  getEffectiveRealtimeToastSeverity,
  getRealtimeEventLog,
  getRealtimeStatusSnapshot,
  getRealtimeToastSeverity,
  getRealtimeToastSnoozeUntil,
  getTabId,
  REALTIME_EVENT_LOG_CHANGED_EVENT,
  REALTIME_EVENT_LOG_KEY,
  REALTIME_EVENT_LOG_MAX,
  REALTIME_STATUS_SNAPSHOT_CHANGED_EVENT,
  REALTIME_STATUS_SNAPSHOT_KEY,
  REALTIME_TOAST_SEVERITY_KEY,
  REALTIME_TOAST_SNOOZE_UNTIL_KEY,
  setRealtimeEventLog,
  setRealtimeStatusSnapshot,
  setRealtimeToastSeverity,
  setRealtimeToastSnoozeUntil,
  shouldShowRealtimeToast,
  type RealtimeToastSeverity,
} from "@/lib/chat-preferences";
import { fetchRealtimeToastSeverityFromCloud } from "@/lib/realtime-toast-severity-cloud";
import { formatDateTime } from "@/lib/luize-mocks";

const PAGE_SIZE = 200;

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function isValidMessageRole(role: string): role is MessageRow["role"] {
  return role === "user" || role === "assistant";
}

const fallbackWelcome: MessageRow = {
  id: "welcome",
  role: "assistant",
  content: "Pronta para organizar sua operação. Pergunte sobre agenda, finanças, saúde ou documentos.",
  created_at: new Date().toISOString(),
};

function sanitizeMessages(rows: Array<{ id: string; role: string; content: string; created_at: string }> | null | undefined) {
  return (rows ?? []).filter((row): row is MessageRow => isValidMessageRole(row.role));
}

function getFriendlyWebhookError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    rawMessage.includes("timeouterror") ||
    rawMessage.includes("504") ||
    rawMessage.includes("timeout")
  ) {
    return "O webhook demorou demais para responder. Tente novamente em instantes.";
  }

  if (
    rawMessage.includes("allowlist") ||
    rawMessage.includes("domínio do webhook não está na allowlist") ||
    rawMessage.includes("domínio do webhook não é permitido")
  ) {
    return "O domínio configurado para o webhook está bloqueado por segurança. Revise a URL em Configurações.";
  }

  if (
    rawMessage.includes("failed to fetch") ||
    rawMessage.includes("network") ||
    rawMessage.includes("non-2xx") ||
    rawMessage.includes("webhook retornou") ||
    rawMessage.includes("falha ao acionar o backend do chat")
  ) {
    return "O webhook está indisponível no momento. Verifique se ele está online e tente novamente.";
  }

  return error instanceof Error ? error.message : "A resposta não pôde ser concluída.";
}

type WebhookStatus = "idle" | "checking" | "online" | "offline" | "timeout" | "not_configured" | "invalid";

const STATUS_BADGE: Record<WebhookStatus, { variant: "success" | "warning" | "destructive" | "secondary"; label: string }> = {
  idle: { variant: "secondary", label: "Aguardando verificação" },
  checking: { variant: "secondary", label: "Verificando conexão..." },
  online: { variant: "success", label: "Webhook online" },
  offline: { variant: "destructive", label: "Webhook offline" },
  timeout: { variant: "destructive", label: "Webhook sem resposta" },
  not_configured: { variant: "warning", label: "Webhook não configurado" },
  invalid: { variant: "destructive", label: "Webhook inválido" },
};

type RealtimeStatus = "connecting" | "connected" | "disconnected" | "error" | "paused";
type RealtimeEventStatus = RealtimeStatus | "settings";

const REALTIME_BADGE: Record<RealtimeStatus, { variant: "success" | "warning" | "destructive" | "secondary"; label: string; dot: string }> = {
  connecting: { variant: "secondary", label: "Conectando realtime", dot: "bg-muted-foreground animate-pulse" },
  connected: { variant: "success", label: "Realtime conectado", dot: "bg-emerald-500 animate-pulse" },
  disconnected: { variant: "warning", label: "Realtime desconectado", dot: "bg-amber-500" },
  error: { variant: "destructive", label: "Realtime com erro", dot: "bg-destructive" },
  paused: { variant: "secondary", label: "Realtime pausado", dot: "bg-muted-foreground" },
};

type RealtimeEvent = {
  at: number;
  status: RealtimeEventStatus;
  reason: string;
};

function csvEscape(value: string): string {
  // RFC 4180: wrap in quotes if value has comma, quote, CR or LF; double internal quotes
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportEventLogToCsv(events: RealtimeEvent[]): void {
  if (typeof window === "undefined" || events.length === 0) return;
  const header = ["timestamp_iso", "timestamp_local_pt_br", "status", "reason"];
  const rows = events.map((e) => {
    const date = new Date(e.at);
    return [
      date.toISOString(),
      date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      e.status,
      e.reason,
    ].map(csvEscape).join(",");
  });
  // Prepend BOM so Excel detects UTF-8 (preserves acentos)
  const csv = "\uFEFF" + [header.join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `realtime-eventos-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke to allow the download to start in all browsers
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const EVENT_DOT: Record<RealtimeEventStatus, string> = {
  connecting: "bg-muted-foreground",
  connected: "bg-emerald-500",
  disconnected: "bg-amber-500",
  error: "bg-destructive",
  paused: "bg-muted-foreground",
  settings: "bg-accent-blue",
};

const EVENT_LABEL: Record<RealtimeEventStatus, string> = {
  connecting: "Conectando",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro",
  paused: "Pausado",
  settings: "Preferência",
};

const OPEN_REALTIME_HISTORY_EVENT = "luize:open-realtime-history";

function openRealtimeHistory(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_REALTIME_HISTORY_EVENT));
}

function RealtimeHistoryPopover({
  eventLog,
  onClearLog,
}: {
  eventLog: RealtimeEvent[];
  onClearLog: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<RealtimeEventStatus>>(new Set());
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Listen to global "open history" event (fired from realtime toasts)
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      triggerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(OPEN_REALTIME_HISTORY_EVENT, handler);
    return () => window.removeEventListener(OPEN_REALTIME_HISTORY_EVENT, handler);
  }, []);

  const toggleStatus = useCallback((status: RealtimeEventStatus) => {
    setStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setStatusFilter(new Set());
    setDateFilter(undefined);
  }, []);

  const filteredEvents = useMemo(() => {
    let result = eventLog;
    if (statusFilter.size > 0) {
      result = result.filter((e) => statusFilter.has(e.status));
    }
    if (dateFilter) {
      const start = new Date(dateFilter);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateFilter);
      end.setHours(23, 59, 59, 999);
      result = result.filter((e) => e.at >= start.getTime() && e.at <= end.getTime());
    }
    return result;
  }, [eventLog, statusFilter, dateFilter]);

  const filtersActive = statusFilter.size > 0 || dateFilter !== undefined;
  // Status chips — keep meaningful transitions, hide "connecting" intermediate to reduce clutter
  const filterableStatuses: RealtimeEventStatus[] = ["connected", "disconnected", "error", "paused", "connecting", "settings"];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px]"
          aria-label="Ver histórico de eventos do realtime"
        >
          <History className="size-3" />
          Histórico
          {eventLog.length > 0 ? (
            <Badge variant="outline" className="h-4 px-1 font-mono text-[10px]">
              {eventLog.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Últimos eventos · realtime
          </p>
          {eventLog.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => exportEventLogToCsv(filteredEvents)}
                className="h-6 gap-1 px-2 text-[10px]"
                aria-label="Exportar histórico filtrado em CSV"
              >
                <Download className="size-3" />
                CSV
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearLog}
                className="h-6 px-2 text-[10px]"
                aria-label="Limpar histórico de eventos"
              >
                Limpar
              </Button>
            </div>
          ) : null}
        </div>

        {eventLog.length > 0 ? (
          <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-1">
              {filterableStatuses.map((s) => (
                <Toggle
                  key={s}
                  size="sm"
                  pressed={statusFilter.has(s)}
                  onPressedChange={() => toggleStatus(s)}
                  className="h-6 gap-1 px-2 text-[10px] data-[state=on]:bg-primary/20 data-[state=on]:text-foreground"
                  aria-label={`Filtrar por ${EVENT_LABEL[s]}`}
                >
                  <span className={`inline-block size-1.5 rounded-full ${EVENT_DOT[s]}`} aria-hidden="true" />
                  {EVENT_LABEL[s]}
                </Toggle>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 flex-1 justify-start gap-1.5 px-2 text-[11px] font-mono",
                      !dateFilter && "text-muted-foreground",
                    )}
                    aria-label="Filtrar histórico por data"
                  >
                    <CalendarIcon className="size-3" />
                    {dateFilter
                      ? dateFilter.toLocaleDateString("pt-BR")
                      : "Filtrar por data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={(d) => {
                      setDateFilter(d ?? undefined);
                      setDatePickerOpen(false);
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {filtersActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-7 gap-1 px-2 text-[10px]"
                  aria-label="Limpar filtros"
                >
                  <FilterX className="size-3" />
                  Limpar filtros
                </Button>
              ) : null}
            </div>
            {filtersActive ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                {filteredEvents.length} de {eventLog.length} evento{eventLog.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        ) : null}

        {eventLog.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-muted-foreground">
            Nenhum evento registrado ainda nesta sessão.
          </p>
        ) : filteredEvents.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-muted-foreground">
            Nenhum evento corresponde aos filtros aplicados.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto py-1">
            {[...filteredEvents].reverse().map((event, idx) => (
              <li
                key={`${event.at}-${idx}`}
                className="flex items-start gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <span
                  className={`mt-1 inline-block size-2 shrink-0 rounded-full ${EVENT_DOT[event.status]}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-foreground">
                      {EVENT_LABEL[event.status]}
                    </span>
                    <time className="font-mono text-[10px] text-muted-foreground">
                      {new Date(event.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </time>
                  </div>
                  <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{event.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RealtimeIndicator({
  status,
  insertCount,
  deleteCount,
  lastSyncAt,
  reason,
  lastChangeAt,
  onReconnect,
  reconnecting,
  paused,
  eventLog,
  onClearLog,
}: {
  status: RealtimeStatus;
  insertCount: number;
  deleteCount: number;
  lastSyncAt: Date | null;
  reason: string | null;
  lastChangeAt: Date | null;
  onReconnect: () => void;
  reconnecting: boolean;
  paused: boolean;
  eventLog: RealtimeEvent[];
  onClearLog: () => void;
}) {
  const meta = REALTIME_BADGE[status];
  const total = insertCount + deleteCount;
  const lastUpdate = lastSyncAt ?? lastChangeAt;
  const canReconnect = !paused && (status === "disconnected" || status === "error" || status === "connecting");
  return (
    <div className="flex flex-col gap-1 border-b border-border bg-panel/60 px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${meta.dot}`} aria-hidden="true" />
          <Radio className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground">{meta.label}</span>
          {canReconnect ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReconnect}
              disabled={reconnecting}
              className="ml-1 h-7 gap-1.5 px-2 text-[11px]"
              aria-label="Reconectar ao Supabase Realtime agora"
            >
              <RefreshCw className={`size-3 ${reconnecting ? "animate-spin" : ""}`} />
              {reconnecting ? "Reconectando..." : "Reconectar agora"}
            </Button>
          ) : null}
          <RealtimeHistoryPopover eventLog={eventLog} onClearLog={onClearLog} />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={total > 0 ? "secondary" : "outline"} className="font-mono">
            {total} sync{total === 1 ? "" : "s"} / 60s
          </Badge>
          {total > 0 ? (
            <span className="font-mono text-muted-foreground">
              +{insertCount} · −{deleteCount}
            </span>
          ) : null}
          {lastUpdate ? (
            <span className="font-mono text-muted-foreground">
              últ. {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          ) : null}
        </div>
      </div>
      {status === "paused" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-1 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100"
        >
          <Pause className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-mono uppercase tracking-[0.18em] text-amber-200">Sincronização pausada</p>
            <p className="mt-0.5 leading-relaxed text-amber-100/90">
              Novas mensagens enviadas em outras abas ou pelo Telegram <strong>não aparecerão aqui</strong> até você retomar.
              O envio manual no chat continua funcionando, mas o histórico só atualiza ao recarregar ou ao retomar a sincronização no botão acima.
            </p>
          </div>
        </div>
      ) : reason && status !== "connected" ? (
        <p className="font-mono text-[11px] text-muted-foreground">{reason}</p>
      ) : null}
    </div>
  );
}

const Chat = () => {
  useDocumentTitle("Chat");
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<WebhookStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [realtimeReason, setRealtimeReason] = useState<string | null>(null);
  const [realtimeLastChangeAt, setRealtimeLastChangeAt] = useState<Date | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<Array<{ kind: "insert" | "delete"; at: number }>>([]);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [realtimePaused, setRealtimePaused] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [eventLog, setEventLog] = useState<RealtimeEvent[]>(() => getRealtimeEventLog());
  const handleClearEventLog = useCallback(() => {
    setEventLog([]);
    clearRealtimeEventLog();
  }, []);
  const appendEvent = useCallback((status: RealtimeStatus, reason: string) => {
    setEventLog((current) => {
      const last = current[current.length - 1];
      if (last && last.status === status && last.reason === reason) return current;
      const merged = [...current, { at: Date.now(), status, reason, tabId: getTabId() }];
      const next = merged.length > REALTIME_EVENT_LOG_MAX ? merged.slice(merged.length - REALTIME_EVENT_LOG_MAX) : merged;
      setRealtimeEventLog(next);
      return next;
    });
  }, []);

  // Cross-tab + same-tab sync of the persisted realtime event log
  useEffect(() => {
    const sync = () => {
      const next = getRealtimeEventLog();
      setEventLog((current) => {
        if (current.length === next.length && current.every((e, i) => e.at === next[i].at && e.status === next[i].status)) {
          return current;
        }
        return next;
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REALTIME_EVENT_LOG_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(REALTIME_EVENT_LOG_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REALTIME_EVENT_LOG_CHANGED_EVENT, sync);
    };
  }, []);

  // Cross-tab live mirror of the realtime connection status.
  // When another tab updates the snapshot, reflect it locally and emit a discreet toast
  // so the user sees the change live regardless of which tab triggered it.
  useEffect(() => {
    const ownTabId = getTabId();
    let lastAppliedAt = 0;

    const apply = (notify: boolean) => {
      const snap = getRealtimeStatusSnapshot();
      if (!snap) return;
      if (snap.tabId === ownTabId) return; // local change, already handled inline
      if (snap.at <= lastAppliedAt) return;
      // The connection snapshot never carries "settings" — that's an event-log-only marker.
      if (snap.status === "settings") return;
      lastAppliedAt = snap.at;

      // Mirror state so the badge/UI reflects the live status from the other tab
      setRealtimeStatus(snap.status);
      setRealtimeReason(snap.reason);
      setRealtimeLastChangeAt(new Date(snap.at));

      if (!notify) return;
      if (!shouldShowRealtimeToast(realtimeToastSeverityRef.current, snap.status)) return;

      const time = new Date(snap.at).toLocaleTimeString("pt-BR");
      const description = `${snap.reason} · em outra aba às ${time}`;
      const action = { label: "Ver histórico", onClick: () => openRealtimeHistory() };
      const opts = { description, action } as const;

      if (snap.status === "connected") sonnerToast.success("Realtime reconectado", opts);
      else if (snap.status === "disconnected") sonnerToast.warning("Realtime desconectado", opts);
      else if (snap.status === "error") sonnerToast.error("Falha no realtime", opts);
      else if (snap.status === "connecting") sonnerToast.info("Conectando ao realtime", { ...opts, duration: 2500 });
      else if (snap.status === "paused") sonnerToast.info("Sincronização pausada", opts);
    };

    // Adopt initial snapshot silently (no toast on mount)
    apply(false);

    const onStorage = (event: StorageEvent) => {
      if (event.key === REALTIME_STATUS_SNAPSHOT_KEY) apply(true);
    };
    const onLocal = () => apply(true);
    window.addEventListener("storage", onStorage);
    window.addEventListener(REALTIME_STATUS_SNAPSHOT_CHANGED_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REALTIME_STATUS_SNAPSHOT_CHANGED_EVENT, onLocal);
    };
  }, []);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousScrollHeightRef = useRef<number>(0);
  const realtimeStatusRef = useRef<RealtimeStatus>("connecting");
  const nextConnectReasonRef = useRef<string>("Conexão inicial");
  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  // Live preference: realtime toast severity (per-device, stored in localStorage).
  // We track the *effective* severity so an active snooze automatically silences toasts
  // without us having to thread an extra check through every emit site.
  const realtimeToastSeverityRef = useRef<RealtimeToastSeverity>(getEffectiveRealtimeToastSeverity());
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() => getRealtimeToastSnoozeUntil());
  useEffect(() => {
    const sync = () => {
      realtimeToastSeverityRef.current = getEffectiveRealtimeToastSeverity();
      setSnoozedUntil(getRealtimeToastSnoozeUntil());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REALTIME_TOAST_SEVERITY_KEY || event.key === REALTIME_TOAST_SNOOZE_UNTIL_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHAT_PREFS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHAT_PREFS_CHANGED_EVENT, sync);
    };
  }, []);

  // Auto-clear the snooze the moment it expires, so the UI updates and the next
  // legitimate toast can fire without requiring a tab switch / focus event.
  useEffect(() => {
    if (snoozedUntil === null) return;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) {
      setRealtimeToastSnoozeUntil(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setRealtimeToastSnoozeUntil(null); // emits CHAT_PREFS_CHANGED_EVENT → ref + state sync
    }, remaining + 50);
    return () => window.clearTimeout(timer);
  }, [snoozedUntil]);

  // One-shot: hydrate the severity preference from the cloud so it follows the user
  // across devices, even if they never opened the Configurações page on this device.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const cloud = await fetchRealtimeToastSeverityFromCloud(user.id);
      if (cancelled || !cloud) return;
      if (cloud !== getRealtimeToastSeverity()) {
        setRealtimeToastSeverity(cloud); // updates cache + emits CHAT_PREFS_CHANGED_EVENT (ref will sync)
      } else {
        realtimeToastSeverityRef.current = cloud;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const checkWebhook = useCallback(async () => {
    setStatus("checking");
    setStatusDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke("chat-webhook", {
        body: { mode: "ping" },
      });
      if (error) {
        setStatus("offline");
        setStatusDetail(getFriendlyWebhookError(error));
        setLatencyMs(null);
        return;
      }
      const next = (data?.status as WebhookStatus | undefined) ?? "offline";
      setStatus(next);
      setStatusDetail(typeof data?.message === "string" ? data.message : null);
      setLatencyMs(typeof data?.latencyMs === "number" ? data.latencyMs : null);
    } catch (error) {
      setStatus("offline");
      setStatusDetail(getFriendlyWebhookError(error));
      setLatencyMs(null);
    } finally {
      setLastCheckedAt(new Date());
    }
  }, []);

  // Initial load: latest PAGE_SIZE messages + settings
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const [{ data: messageRows, error: messagesError }, { data: settingsRow, error: settingsError }] = await Promise.all([
        supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE + 1),
        supabase.from("settings").select("webhook_url").eq("user_id", user.id).maybeSingle(),
      ]);

      if (messagesError) {
        toast({ variant: "destructive", title: "Falha ao carregar chat", description: messagesError.message });
      } else {
        const rows = (messageRows ?? []) as Array<{ id: string; role: string; content: string; created_at: string }>;
        const more = rows.length > PAGE_SIZE;
        const slice = more ? rows.slice(0, PAGE_SIZE) : rows;
        setMessages(sanitizeMessages(slice.reverse()));
        setHasMore(more);
      }

      const url = !settingsError ? settingsRow?.webhook_url ?? null : null;
      setWebhookUrl(url);
      setLoading(false);

      if (url) {
        void checkWebhook();
      } else {
        setStatus("not_configured");
        setLastCheckedAt(new Date());
      }
    };

    void load();
  }, [toast, user, checkWebhook]);

  // Realtime: keep history in sync across tabs/devices for the current user, with auto-reconnect + toasts
  useEffect(() => {
    if (!user) return;
    if (realtimePaused) {
      // Pause: skip subscribing entirely; cleanup runs on next pause toggle / unmount
      const reason = "Sincronização pausada manualmente";
      setRealtimeStatus("paused");
      setRealtimeReason(reason);
      setRealtimeLastChangeAt(new Date());
      setRealtimeStatusSnapshot({ status: "paused", reason, at: Date.now(), tabId: getTabId() });
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;
    let cancelled = false;
    let lastNotifiedStatus: RealtimeStatus | null = null;

    const formatNow = () => new Date().toLocaleTimeString("pt-BR");

    const notifyTransition = (next: RealtimeStatus, reason: string) => {
      if (lastNotifiedStatus === next) return;
      const previous = lastNotifiedStatus;
      lastNotifiedStatus = next;

      // Skip the very first "connected" toast on initial mount to avoid noise
      if (next === "connected" && previous === null) return;

      // Honor severity preference (none/errors_only/warnings_and_errors/all)
      if (!shouldShowRealtimeToast(realtimeToastSeverityRef.current, next)) return;

      const historyAction = { label: "Ver histórico", onClick: () => openRealtimeHistory() };

      if (next === "connected") {
        sonnerToast.success("Realtime reconectado", {
          description: `${reason} · atualizado às ${formatNow()}`,
          action: historyAction,
        });
      } else if (next === "disconnected") {
        sonnerToast.warning("Realtime desconectado", {
          description: `${reason} · última atualização às ${formatNow()}`,
          action: historyAction,
        });
      } else if (next === "error") {
        sonnerToast.error("Falha no realtime", {
          description: `${reason} · tentando reconectar... (${formatNow()})`,
          action: historyAction,
        });
      } else if (next === "connecting") {
        // Discreet info toast — only fires on real transitions (e.g. retry, manual reconnect, network back)
        sonnerToast.info("Conectando ao realtime", {
          description: `${reason} · ${formatNow()}`,
          duration: 2500,
          action: historyAction,
        });
      }
    };

    const updateStatus = (next: RealtimeStatus, reason: string) => {
      setRealtimeStatus(next);
      setRealtimeLastChangeAt(new Date());
      setRealtimeReason(reason);
      appendEvent(next, reason);
      notifyTransition(next, reason);
      // Publish snapshot so other tabs can mirror this state instantly
      setRealtimeStatusSnapshot({ status: next, reason, at: Date.now(), tabId: getTabId() });
    };

    const scheduleReconnect = (reason: string) => {
      if (cancelled) return;
      attempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 4));
      const seconds = Math.round(delay / 1000);
      setRealtimeReason(`${reason} — nova tentativa em ${seconds}s`);
      reconnectTimer = window.setTimeout(() => {
        if (!cancelled) connect(`Reconectando (tentativa ${attempt}) após: ${reason}`);
      }, delay);
    };

    const ownerId = user.id;

    const connect = (reason = "Conexão inicial") => {
      if (cancelled) return;
      // Only emit a "connecting" transition if we're not already connected
      if (realtimeStatusRef.current !== "connected") {
        updateStatus("connecting", reason);
      }

      channel = supabase
        .channel(`messages:${ownerId}:${attempt}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${ownerId}` },
          (payload) => {
            // Defense-in-depth: ignore late events from a stale channel after user switch / unmount
            if (cancelled) return;
            const row = payload.new as { id: string; role: string; content: string; created_at: string; user_id?: string };
            if (row.user_id && row.user_id !== ownerId) return;
            if (!isValidMessageRole(row.role)) return;
            const role: MessageRow["role"] = row.role;
            setMessages((current) => {
              if (current.some((m) => m.id === row.id)) return current;
              const next: MessageRow = { id: row.id, role, content: row.content, created_at: row.created_at };
              return [...current, next];
            });
            setRecentSyncs((current) => [...current, { kind: "insert", at: Date.now() }]);
            setLastSyncAt(new Date());
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages", filter: `user_id=eq.${ownerId}` },
          (payload) => {
            if (cancelled) return;
            const oldRow = payload.old as { id?: string; user_id?: string };
            if (oldRow?.user_id && oldRow.user_id !== ownerId) return;
            if (oldRow?.id) {
              setMessages((current) => current.filter((m) => m.id !== oldRow.id));
              setRecentSyncs((current) => [...current, { kind: "delete", at: Date.now() }]);
              setLastSyncAt(new Date());
            }
          },
        )
        .subscribe((subStatus) => {
          if (cancelled) return;
          if (subStatus === "SUBSCRIBED") {
            attempt = 0;
            updateStatus("connected", "Canal de mensagens ativo");
          } else if (subStatus === "CHANNEL_ERROR") {
            updateStatus("error", "Erro de canal no Supabase Realtime");
            void supabase.removeChannel(channel!).catch(() => undefined);
            channel = null;
            scheduleReconnect("Erro de canal");
          } else if (subStatus === "TIMED_OUT") {
            updateStatus("error", "Tempo limite ao conectar ao Realtime");
            void supabase.removeChannel(channel!).catch(() => undefined);
            channel = null;
            scheduleReconnect("Timeout de conexão");
          } else if (subStatus === "CLOSED") {
            updateStatus("disconnected", "Conexão encerrada pelo servidor");
            scheduleReconnect("Conexão encerrada");
          }
        });
    };

    const initialReason = nextConnectReasonRef.current;
    nextConnectReasonRef.current = "Conexão inicial";
    connect(initialReason);

    const handleOnline = () => {
      if (realtimeStatusRef.current !== "connected") {
        attempt = 0;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (channel) {
          void supabase.removeChannel(channel).catch(() => undefined);
          channel = null;
        }
        connect("Rede do dispositivo voltou online");
      }
    };
    const handleOffline = () => {
      updateStatus("disconnected", "Rede do dispositivo offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (channel) void supabase.removeChannel(channel);
      setRealtimeStatus("disconnected");
    };
  }, [user, realtimePaused, reconnectNonce, appendEvent]);

  const handleManualReconnect = useCallback(() => {
    if (realtimePaused) return;
    setReconnecting(true);
    nextConnectReasonRef.current = "Reconexão manual solicitada";
    setReconnectNonce((n) => n + 1);
    // The realtime effect will tear down and re-subscribe (firing the "connecting" transition itself);
    // clear the spinner shortly after
    window.setTimeout(() => setReconnecting(false), 1500);
  }, [realtimePaused]);

  // Drop recent syncs older than 60s so the counter reflects only the latest activity
  useEffect(() => {
    if (recentSyncs.length === 0) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 60_000;
      setRecentSyncs((current) => {
        const filtered = current.filter((entry) => entry.at >= cutoff);
        return filtered.length === current.length ? current : filtered;
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [recentSyncs.length]);

  // Auto-scroll to bottom on new messages (skip when user just loaded older ones)
  useEffect(() => {
    if (loadingMore) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, loadingMore]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (!loadingMore || !scrollRef.current) return;
    const container = scrollRef.current;
    container.scrollTop = container.scrollHeight - previousScrollHeightRef.current;
  }, [messages, loadingMore]);

  const loadOlder = useCallback(async () => {
    if (!user || !hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    if (scrollRef.current) {
      previousScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
    const oldest = messages[0];
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (error) {
      toast({ variant: "destructive", title: "Falha ao carregar histórico", description: error.message });
      setLoadingMore(false);
      return;
    }
    const rows = (data ?? []) as Array<{ id: string; role: string; content: string; created_at: string }>;
    const more = rows.length > PAGE_SIZE;
    const slice = (more ? rows.slice(0, PAGE_SIZE) : rows).reverse();
    setMessages((current) => [...sanitizeMessages(slice), ...current]);
    setHasMore(more);
    setLoadingMore(false);
  }, [user, hasMore, loadingMore, messages, toast]);

  const togglePause = useCallback(async () => {
    // If currently paused, we are about to resume: backfill any messages received during the pause
    if (realtimePaused && user) {
      setResyncing(true);
      try {
        const newest = messages.length ? messages[messages.length - 1] : null;
        const query = supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(PAGE_SIZE);
        const { data, error } = newest
          ? await query.gt("created_at", newest.created_at)
          : await query;
        if (error) {
          sonnerToast.error("Falha ao ressincronizar", { description: error.message });
        } else {
          const fresh = sanitizeMessages(data ?? []);
          if (fresh.length) {
            setMessages((current) => {
              const seen = new Set(current.map((m) => m.id));
              const merged = [...current, ...fresh.filter((m) => !seen.has(m.id))];
              return merged;
            });
            setLastSyncAt(new Date());
            sonnerToast.success("Sincronização retomada", {
              description: `${fresh.length} mensagem${fresh.length === 1 ? "" : "s"} recuperada${fresh.length === 1 ? "" : "s"} · ${new Date().toLocaleTimeString("pt-BR")}`,
            });
          } else {
            sonnerToast.success("Sincronização retomada", {
              description: `Nenhuma nova mensagem · ${new Date().toLocaleTimeString("pt-BR")}`,
            });
          }
        }
      } finally {
        setResyncing(false);
      }
      setRealtimePaused(false);
    } else {
      // Pausing
      setRealtimePaused(true);
      sonnerToast.message("Sincronização pausada", {
        description: `Histórico antigo continua disponível · ${new Date().toLocaleTimeString("pt-BR")}`,
      });
    }
  }, [realtimePaused, user, messages]);

  const handleClearHistory = useCallback(async () => {
    if (!user || clearing) return;
    setClearing(true);
    const { error } = await supabase.from("messages").delete().eq("user_id", user.id);
    if (error) {
      toast({ variant: "destructive", title: "Falha ao limpar histórico", description: error.message });
    } else {
      setMessages([]);
      setHasMore(false);
      toast({ title: "Histórico limpo", description: "Todas as mensagens foram removidas." });
    }
    setClearing(false);
    setConfirmClearOpen(false);
  }, [user, clearing, toast]);

  const handleExport = useCallback(async () => {
    if (!user || exporting) return;
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const payload = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        count: data?.length ?? 0,
        messages: data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `luize-chat-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Histórico exportado", description: `${payload.count} mensagens baixadas.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Falha ao exportar",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setExporting(false);
    }
  }, [user, exporting, toast]);

  const renderedMessages = useMemo(() => (messages.length ? messages : [fallbackWelcome]), [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !input.trim() || sending) return;

    const content = input.trim();
    setSending(true);
    setInput("");

    const { data: userMessage, error: userInsertError } = await supabase
      .from("messages")
      .insert({ user_id: user.id, role: "user", content })
      .select("id, role, content, created_at")
      .single();

    if (userInsertError || !userMessage) {
      toast({ variant: "destructive", title: "Falha ao enviar", description: userInsertError?.message ?? "Tente novamente." });
      setInput(content);
      setSending(false);
      return;
    }

    setMessages((current) => [...current, userMessage as MessageRow]);

    try {
      let reply = "Webhook ainda não configurado. Defina a URL em Configurações para ativar respostas do n8n.";

      if (webhookUrl) {
        const history = [...messages, userMessage as MessageRow].map((message) => ({ role: message.role, content: message.content }));
        const { data, error } = await supabase.functions.invoke("chat-webhook", {
          body: {
            message: content,
            source: "luize-chat",
            history,
          },
        });

        if (error) {
          throw new Error(error.message || "Falha ao acionar o backend do chat.");
        }

        reply = typeof data?.reply === "string" ? data.reply.trim() || reply : reply;
      }

      const { data: assistantMessage, error: assistantInsertError } = await supabase
        .from("messages")
        .insert({ user_id: user.id, role: "assistant", content: reply })
        .select("id, role, content, created_at")
        .single();

      if (assistantInsertError || !assistantMessage) {
        throw assistantInsertError ?? new Error("Resposta sem persistência");
      }

      setMessages((current) => [...current, assistantMessage as MessageRow]);
      if (webhookUrl && status !== "online") {
        setStatus("online");
        setStatusDetail(null);
        setLastCheckedAt(new Date());
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no webhook",
        description: getFriendlyWebhookError(error),
      });
      // Re-check status so the indicator reflects reality after a failure
      if (webhookUrl) void checkWebhook();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_0.7fr]">
      <SectionCard
        title="Canal direto com a Luize"
        description="Interface de chat persistida no banco e pronta para webhook externo"
        eyebrow={t("chat.eyebrow.messaging")}
        className="min-h-[72vh]"
        contentClassName="flex h-full flex-col"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[status].variant}>{STATUS_BADGE[status].label}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void checkWebhook(); }}
              disabled={status === "checking" || !webhookUrl}
              className="h-8 gap-1.5"
              aria-label="Re-testar conexão com o webhook"
            >
              <RefreshCw className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
              Testar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void togglePause(); }}
              disabled={resyncing}
              className="h-8 gap-1.5"
              aria-label={realtimePaused ? "Retomar sincronização realtime" : "Pausar sincronização realtime"}
              aria-pressed={realtimePaused}
            >
              {realtimePaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {resyncing ? "Ressincronizando..." : realtimePaused ? "Retomar" : "Pausar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void handleExport(); }}
              disabled={exporting || loading || messages.length === 0}
              className="h-8 gap-1.5"
              aria-label="Exportar histórico em JSON"
            >
              <Download className="size-3.5" />
              {exporting ? "Exportando..." : "Exportar"}
            </Button>
            <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={clearing || loading || messages.length === 0}
                  className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Limpar histórico do chat"
                >
                  <Trash2 className="size-3.5" />
                  Limpar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação remove permanentemente todas as mensagens deste usuário no banco. Não há como desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      void handleClearHistory();
                    }}
                    disabled={clearing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {clearing ? "Limpando..." : "Sim, limpar tudo"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      >
        <div className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-panel-elevated">
          <RealtimeIndicator
            status={realtimeStatus}
            insertCount={recentSyncs.filter((s) => s.kind === "insert").length}
            deleteCount={recentSyncs.filter((s) => s.kind === "delete").length}
            lastSyncAt={lastSyncAt}
            reason={realtimeReason}
            lastChangeAt={realtimeLastChangeAt}
            onReconnect={handleManualReconnect}
            reconnecting={reconnecting}
            paused={realtimePaused}
            eventLog={eventLog}
            onClearLog={handleClearEventLog}
          />
          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
            {hasMore && !loading ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { void loadOlder(); }}
                  disabled={loadingMore}
                  className="h-8 gap-1.5"
                >
                  <ChevronUp className={`size-3.5 ${loadingMore ? "animate-pulse" : ""}`} />
                  {loadingMore ? "Carregando..." : "Carregar mensagens antigas"}
                </Button>
              </div>
            ) : null}
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="max-w-[80%] rounded-2xl border border-border bg-panel px-4 py-3">
                  <div className="h-4 animate-pulse rounded bg-muted" />
                </div>
              ))
            ) : (
              <>
                {renderedMessages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-[1.4rem] border px-4 py-3 md:max-w-[70%] ${
                          isUser
                            ? "border-secondary/30 bg-secondary/20 text-foreground"
                            : "border-border bg-panel text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                        <p className="mt-2 text-right font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {formatDateTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {sending ? (
                  <div className="flex justify-start">
                    <div className="rounded-[1.4rem] border border-border bg-panel px-4 py-3">
                      <p className="text-sm text-muted-foreground">digitando...</p>
                    </div>
                  </div>
                ) : null}
              </>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border bg-panel/80 p-4">
            <div className="flex items-end gap-3">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escreva um comando, pergunta ou pedido..."
                className="min-h-[60px] resize-none border-border bg-background"
              />
              <Button type="submit" variant="hero" size="icon" className="h-[60px] w-[60px] rounded-2xl" disabled={sending || !input.trim()}>
                <SendHorizontal className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </SectionCard>

      <SectionCard title="Roteamento" description="Destino atual das mensagens" eyebrow={t("chat.eyebrow.deliveryNotes")}>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Persistência</p>
            <p>
              Toda mensagem é gravada na tabela <span className="font-mono text-foreground">messages</span>.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-kicker">Status da conexão</p>
              <Badge variant={STATUS_BADGE[status].variant}>{STATUS_BADGE[status].label}</Badge>
            </div>
            {statusDetail ? <p className="mb-2 text-foreground">{statusDetail}</p> : null}
            {latencyMs !== null && status === "online" ? (
              <p className="mb-2 font-mono text-xs text-muted-foreground">Latência: {latencyMs} ms</p>
            ) : null}
            {lastCheckedAt ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Verificado às {lastCheckedAt.toLocaleTimeString("pt-BR")}
              </p>
            ) : null}
            {status === "not_configured" ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/configuracoes">Configurar webhook</Link>
              </Button>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Webhook</p>
            <p className="break-all">{webhookUrl || "Nenhuma URL configurada no momento."}</p>
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Payload</p>
             <p className="leading-6">Mensagem atual, userId e histórico validado com papéis permitidos são enviados em POST JSON para o n8n.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default Chat;
