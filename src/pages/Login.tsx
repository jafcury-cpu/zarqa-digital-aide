import { useState } from "react";
import { Chrome, Lock, ShieldCheck } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { lovable } from "@/integrations/lovable";
import { useDocumentTitle } from "@/hooks/use-document-title";

const Login = () => {
  useDocumentTitle("Login");
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const redirectTo = typeof location.state?.from === "string" ? location.state.from : "/dashboard";

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleGoogleSignIn = async () => {
    setSubmitting(true);

    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: {
        prompt: "select_account",
      },
    });

    if (result.redirected) {
      return;
    }

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Não foi possível entrar",
        description: result.error.message,
      });
      setSubmitting(false);
      return;
    }

    toast({
      title: "Redirecionando",
      description: "Concluindo autenticação com Google.",
    });
    setSubmitting(false);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 bg-hero opacity-80" />
        <div className="grid-tech absolute inset-0 opacity-20" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-kicker">Terminal executivo</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[0.16em] text-foreground">Luize</h1>
          </div>
          <ShieldCheck className="size-10 animate-pulse-soft text-primary" />
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <p className="text-kicker">Painel privado</p>
          <p className="text-3xl font-semibold leading-tight text-foreground">
            Um painel privado para coordenar agenda, finanças, saúde e documentos com linguagem de comando executivo.
          </p>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="surface-panel flex items-center gap-3 p-4">
              <Chrome className="size-4 text-accent-blue" />
              Acesso restrito com conta Google autorizada.
            </div>
            <div className="surface-panel flex items-center gap-3 p-4">
              <Lock className="size-4 text-primary" />
              Banco, storage e autenticação protegidos no Lovable Cloud.
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 md:px-8">
        <Card className="surface-elevated w-full max-w-md border-border/90 bg-panel-elevated">
          <CardHeader className="space-y-3">
            <p className="text-kicker">Acesso Privado</p>
            <CardTitle className="text-3xl tracking-tight">Entrar na Luize</CardTitle>
            <CardDescription>Login pessoal único com autenticação segura por Google.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button type="button" variant="hero" size="lg" className="w-full" disabled={submitting} onClick={handleGoogleSignIn}>
                <Chrome className="size-4" />
                {submitting ? "Conectando..." : "Continuar com Google"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">Cadastro público desativado para operação pessoal segura.</p>
              <p className="text-center text-xs text-muted-foreground">O acesso por senha foi removido e o login agora acontece somente pelo Google autorizado.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Login;
