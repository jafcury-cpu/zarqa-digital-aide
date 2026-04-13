import {
  Bell,
  BookUser,
  ChevronRight,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Settings,
  Wallet,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";

const navigation = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Chat", href: "/chat", icon: MessagesSquare },
  { title: "Financeiro", href: "/financeiro", icon: Wallet },
  { title: "Saúde", href: "/saude", icon: HeartPulse },
  { title: "Documentos", href: "/documentos", icon: FileText },
  { title: "Contatos", href: "/contatos", icon: BookUser },
  { title: "Configurações", href: "/configuracoes", icon: Settings },
];

export function ZarqaSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const collapsed = state === "collapsed";
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Falha ao encerrar sessão",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="gap-4 border-b border-sidebar-border px-4 py-5">
        <div className="grid gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sidebar-primary shadow-glow">
              <Bell className="size-5" />
            </div>
            {!collapsed ? (
              <div>
                <p className="font-display text-lg tracking-[0.2em] text-sidebar-foreground">ZARQA ٢٨</p>
                <p className="text-xs uppercase tracking-[0.24em] text-sidebar-foreground/60">Chief of Staff Digital</p>
              </div>
            ) : null}
          </div>
          {!collapsed ? (
            <Badge variant="outline" className="w-fit border-sidebar-border text-sidebar-foreground/80">
              Single-user secure mode
            </Badge>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isActive} className="h-11 rounded-xl">
                      <NavLink
                        to={item.href}
                        end
                        className="group flex items-center gap-3"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="size-4" />
                        {!collapsed ? (
                          <>
                            <span>{item.title}</span>
                            <ChevronRight className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                          </>
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-4">
        {!collapsed ? (
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent p-3">
            <p className="text-kicker">Sessão</p>
            <p className="mt-2 truncate text-sm text-sidebar-foreground">{user?.email}</p>
          </div>
        ) : null}
        <Button
          variant="secondary"
          className="w-full justify-start bg-sidebar-primary text-sidebar-primary-foreground shadow-glow hover:bg-sidebar-primary/90"
          onClick={handleSignOut}
          disabled={signingOut}
          title="Encerrar sessão"
        >
          <LogOut />
          {!collapsed ? <span>{signingOut ? "Saindo..." : "Sair"}</span> : null}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
