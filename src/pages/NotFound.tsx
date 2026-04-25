import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";

const NotFound = () => {
  useDocumentTitle("Página não encontrada");
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="surface-elevated grid max-w-xl gap-5 p-8 text-center">
        <span className="text-kicker">Erro de Roteamento</span>
        <h1 className="text-5xl font-semibold tracking-tight text-foreground">404</h1>
        <p className="text-muted-foreground">
          A rota <span className="font-mono text-foreground">{location.pathname}</span> não existe na malha da Luize.
        </p>
        <div className="flex justify-center">
          <Button asChild variant="hero">
            <a href="/dashboard">
              <ArrowLeft />
              Voltar ao painel
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
