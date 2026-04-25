import { ArrowLeft, Chrome, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/use-document-title";

const ResetPassword = () => {
  useDocumentTitle("Recuperar acesso", "Recuperação de acesso — Luize Blond");
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 bg-hero opacity-80" />
        <div className="grid-tech absolute inset-0 opacity-20" />
        <div className="relative z-10">
          <p className="text-kicker">Account Recovery</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-[0.16em] text-foreground">Luize Blond</h1>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <p className="text-kicker">Segurança operacional</p>
          <p className="text-3xl font-semibold leading-tight text-foreground">O acesso ao painel privado foi migrado para autenticação exclusiva com Google.</p>
          <div className="surface-panel flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-accent-blue" />
            Links antigos de redefinição de senha não são mais usados neste ambiente.
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 md:px-8">
        <Card className="surface-elevated w-full max-w-md border-border/90 bg-panel-elevated">
          <CardHeader className="space-y-3">
            <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
              <Link to="/login">
                <ArrowLeft className="size-4" />
                Voltar ao acesso
              </Link>
            </Button>
            <p className="text-kicker">Acesso atualizado</p>
            <CardTitle className="text-3xl tracking-tight">Entrar com Google</CardTitle>
            <CardDescription>O login por senha foi descontinuado para esta aplicação.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 rounded-2xl border border-border bg-panel p-5">
              <div className="flex items-center gap-3 text-foreground">
                <Chrome className="size-4 text-accent-blue" />
                <p className="font-medium">Use sua conta Google autorizada para entrar.</p>
              </div>
              <p className="text-sm text-muted-foreground">Se você abriu um link antigo de recuperação, apenas volte para a tela inicial e continue com Google.</p>
              <Button asChild variant="hero" className="w-full">
                <Link to="/login">Ir para login com Google</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default ResetPassword;