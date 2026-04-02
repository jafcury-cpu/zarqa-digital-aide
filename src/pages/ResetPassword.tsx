import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

function readHashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

const ResetPassword = () => {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [validRecovery, setValidRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const hashParams = readHashParams();
    const recoveryType = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (recoveryType === "recovery" && accessToken && refreshToken) {
      void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
        if (error) {
          toast({
            variant: "destructive",
            title: "Link inválido",
            description: "Solicite um novo link para redefinir sua senha.",
          });
          setValidRecovery(false);
        } else {
          setValidRecovery(true);
        }
        setReady(true);
      });
      return;
    }

    setValidRecovery(false);
    setReady(true);
  }, [toast]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < 8) return "Use pelo menos 8 caracteres.";
    return null;
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirmPassword) return null;
    if (password !== confirmPassword) return "As senhas não coincidem.";
    return null;
  }, [confirmPassword, password]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordError || confirmError || !password) return;

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível redefinir",
        description: error.message,
      });
      setSubmitting(false);
      return;
    }

    toast({
      title: "Senha atualizada",
      description: "Sua nova senha já está ativa. Faça login para continuar.",
    });
    await supabase.auth.signOut();
    setCompleted(true);
    setSubmitting(false);
  };

  if (completed) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 bg-hero opacity-80" />
        <div className="grid-tech absolute inset-0 opacity-20" />
        <div className="relative z-10">
          <p className="text-kicker">Account Recovery</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-[0.16em] text-foreground">ZARQA ٢٨</h1>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <p className="text-kicker">Segurança operacional</p>
          <p className="text-3xl font-semibold leading-tight text-foreground">Defina uma nova senha e recupere o acesso ao painel privado.</p>
          <div className="surface-panel flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-accent-blue" />
            O link de recuperação é temporário e exige confirmação segura antes da troca.
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 md:px-8">
        <Card className="surface-elevated w-full max-w-md border-border/90 bg-panel-elevated">
          <CardHeader className="space-y-3">
            <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
              <Link to="/login">
                <ArrowLeft className="size-4" />
                Voltar ao login
              </Link>
            </Button>
            <p className="text-kicker">Recuperação de senha</p>
            <CardTitle className="text-3xl tracking-tight">Criar nova senha</CardTitle>
            <CardDescription>Escolha uma senha nova para restaurar seu acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded-xl bg-muted" />
                <div className="h-10 animate-pulse rounded-xl bg-muted" />
              </div>
            ) : validRecovery ? (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    aria-invalid={Boolean(passwordError)}
                  />
                  <p className={`text-sm ${passwordError ? "text-destructive" : "text-muted-foreground"}`}>
                    {passwordError || "Use ao menos 8 caracteres para manter o acesso protegido."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    aria-invalid={Boolean(confirmError)}
                  />
                  {confirmError ? <p className="text-sm text-destructive">{confirmError}</p> : null}
                </div>

                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={submitting || Boolean(passwordError || confirmError)}>
                  <KeyRound className="size-4" />
                  {submitting ? "Atualizando..." : "Salvar nova senha"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border bg-panel p-5">
                <p className="font-medium text-foreground">O link de recuperação é inválido ou expirou.</p>
                <p className="text-sm text-muted-foreground">Volte ao login e solicite um novo email para redefinir sua senha.</p>
                <Button asChild variant="hero" className="w-full">
                  <Link to="/login">Solicitar novo link</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default ResetPassword;