import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AlertTriangle, Clock, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/integrations/supabase/client";

type Status = "valid" | "expiring" | "expired" | "missing" | "loading";

const WARN_THRESHOLD_SECONDS = 5 * 60; // 5 min

function describe(status: Status, secondsLeft: number | null) {
  switch (status) {
    case "loading":
      return { label: "Verificando sessão…", variant: "secondary" as const, Icon: Clock };
    case "valid":
      return {
        label: secondsLeft !== null ? `Sessão ativa · ${formatDuration(secondsLeft)}` : "Sessão ativa",
        variant: "info" as const,
        Icon: ShieldCheck,
      };
    case "expiring":
      return {
        label: `Expira em ${formatDuration(secondsLeft ?? 0)}`,
        variant: "warning" as const,
        Icon: AlertTriangle,
      };
    case "expired":
      return { label: "Sessão expirada", variant: "destructive" as const, Icon: ShieldAlert };
    case "missing":
      return { label: "Sem token válido", variant: "destructive" as const, Icon: ShieldAlert };
  }
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin > 0 ? `${hours}h${remMin}m` : `${hours}h`;
}

export function SessionStatusBadge() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [redirected, setRedirected] = useState(false);

  // Tick every 15s to recalc countdown
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Compute status
  let status: Status = "loading";
  let secondsLeft: number | null = null;

  if (!loading) {
    if (!session) {
      status = "missing";
    } else if (!session.access_token) {
      status = "missing";
    } else if (session.expires_at) {
      secondsLeft = session.expires_at - now;
      if (secondsLeft <= 0) status = "expired";
      else if (secondsLeft <= WARN_THRESHOLD_SECONDS) status = "expiring";
      else status = "valid";
    } else {
      status = "valid";
    }
  }

  // Auto-redirect to /login on expired/missing (skip public pages)
  useEffect(() => {
    if (loading) return;
    const publicRoutes = ["/login", "/reset-password", "/"];
    if (publicRoutes.includes(location.pathname)) return;

    if ((status === "expired" || status === "missing") && !redirected) {
      setRedirected(true);
      toast.error(status === "expired" ? "Sua sessão expirou. Faça login novamente." : "Sem token válido. Redirecionando para o login.");
      void supabase.auth.signOut().finally(() => {
        navigate("/login", { replace: true, state: { from: location.pathname } });
      });
    }
  }, [status, loading, location.pathname, navigate, redirected]);

  // Reset redirect flag when session becomes valid again
  useEffect(() => {
    if (status === "valid" && redirected) setRedirected(false);
  }, [status, redirected]);

  const { label, variant, Icon } = describe(status, secondsLeft);
  const expiresAtIso = session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (status === "expired" || status === "missing") {
                navigate("/login", { replace: true });
              }
            }}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            aria-label={`Estado da sessão: ${label}`}
          >
            <Badge variant={variant} className="hidden md:inline-flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{label}</span>
            </Badge>
            <Badge variant={variant} className="md:hidden">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          <div className="space-y-1">
            <p className="font-medium">Estado da sessão</p>
            <p className="text-muted-foreground">{label}</p>
            <p className="text-muted-foreground">Expira em (SP): {expiresAtIso}</p>
            {(status === "expired" || status === "missing") && (
              <p className="text-destructive-foreground">Clique para ir para /login</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
