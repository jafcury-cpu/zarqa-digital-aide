import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { LuizeSidebar } from "@/components/zarqa/zarqa-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const labels: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Resumo executivo do dia" },
  "/chat": { title: "Chat", subtitle: "Delegue, consulte e acompanhe" },
  "/financeiro": { title: "Financeiro", subtitle: "Liquidez, gastos e vencimentos" },
  "/saude": { title: "Saúde", subtitle: "Biometria e consistência diária" },
  "/documentos": { title: "Documentos", subtitle: "Busca, upload e memória operacional" },
  "/comunicacoes": { title: "Comunicações", subtitle: "Hub centralizado de canais e secretária IA" },
  "/configuracoes": { title: "Configurações", subtitle: "Webhook, timezone e preferências" },
};

export function LuizeAppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const current = labels[location.pathname] ?? labels["/dashboard"];

  return (
    <SidebarProvider defaultOpen>
      <div className="grid min-h-screen w-full bg-background md:grid-cols-[auto_1fr]">
        <LuizeSidebar />
        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-10 w-10 rounded-xl border border-border bg-panel text-foreground hover:bg-panel-elevated md:hidden" />
              <div>
                <p className="text-kicker">Luize Control Surface</p>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">{current.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right md:block">
                <p className="text-sm text-muted-foreground">{current.subtitle}</p>
                <p className="truncate text-xs text-foreground/80">{user?.email}</p>
              </div>
              <Badge variant="info" className="hidden md:inline-flex">
                Sessão ativa
              </Badge>
            </div>
          </header>
          <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
