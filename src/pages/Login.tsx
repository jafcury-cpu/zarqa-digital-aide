import { FormEvent, useState } from "react";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Login = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const redirectTo = typeof location.state?.from === "string" ? location.state.from : "/dashboard";

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível entrar",
        description: error.message,
      });
      setSubmitting(false);
      return;
    }

    toast({
      title: "Sessão iniciada",
      description: "Acesso liberado ao painel ZARQA.",
    });
    setSubmitting(false);
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      toast({
        variant: "destructive",
        title: "Informe seu email",
        description: "Preencha o campo de email para receber o link de recuperação.",
      });
      return;
    }

    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Falha ao enviar email",
        description: error.message,
      });
    } else {
      toast({
        title: "Email enviado",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
    }

    setSendingReset(false);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 bg-hero opacity-80" />
        <div className="grid-tech absolute inset-0 opacity-20" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-kicker">Executive Terminal</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[0.16em] text-foreground">ZARQA ٢٨</h1>
          </div>
          <ShieldCheck className="size-10 animate-pulse-soft text-primary" />
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <p className="text-kicker">Personal Chief of Staff</p>
          <p className="text-3xl font-semibold leading-tight text-foreground">
            Um painel privado para coordenar agenda, finanças, saúde e documentos com linguagem de comando executivo.
          </p>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="surface-panel flex items-center gap-3 p-4">
              <Mail className="size-4 text-accent-blue" />
              Acesso restrito com email e senha.
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
            <CardTitle className="text-3xl tracking-tight">Entrar na ZARQA</CardTitle>
            <CardDescription>Login pessoal único com autenticação por email e senha.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  Senha
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="link" className="h-auto px-0 text-sm" onClick={handleResetPassword} disabled={sendingReset}>
                  {sendingReset ? "Enviando link..." : "Esqueci minha senha"}
                </Button>
              </div>
              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={submitting}>
                {submitting ? "Autenticando..." : "Entrar"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">Cadastro público desativado para operação pessoal segura.</p>
              <p className="text-center text-xs text-muted-foreground">
                Ao receber o email, abra o link seguro para criar uma nova senha.
              </p>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Login;
