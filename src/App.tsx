import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { ThemeProvider } from "@/components/theme-provider";
import { LoadingPanel } from "@/components/luize/loading-panel";
import { LuizeAppLayout } from "@/components/luize/luize-app-layout";
import { DebugOverlay } from "@/components/luize/debug-overlay";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RuntimeErrorBoundary } from "@/components/runtime-error-boundary";

const Index = lazy(() => import("./pages/Index.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Chat = lazy(() => import("./pages/Chat.tsx"));
const Financeiro = lazy(() => import("./pages/Financeiro.tsx"));
const Saude = lazy(() => import("./pages/Saude.tsx"));
const Documentos = lazy(() => import("./pages/Documentos.tsx"));
const Configuracoes = lazy(() => import("./pages/Configuracoes.tsx"));
const Contatos = lazy(() => import("./pages/Contatos.tsx"));
const Comunicacoes = lazy(() => import("./pages/Comunicacoes.tsx"));
const Erros = lazy(() => import("./pages/Erros.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const I18nPreview = lazy(() => import("./pages/I18nPreview.tsx"));
const Status = lazy(() => import("./pages/Status.tsx"));

const queryClient = new QueryClient();

const routeFallback = (
  <div className="min-h-screen bg-background px-4 py-6 md:px-6">
    <div className="mx-auto max-w-6xl space-y-4">
      <LoadingPanel lines={5} />
      <LoadingPanel lines={3} />
    </div>
  </div>
);

const App = () => (
  <RuntimeErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <DebugOverlay />
            <BrowserRouter>
              <Suspense fallback={routeFallback}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/index" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/i18n" element={<I18nPreview />} />
                  <Route path="/status" element={<Status />} />
                  <Route
                    element={
                      <ProtectedRoute>
                        <LuizeAppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/saude" element={<Saude />} />
                    <Route path="/documentos" element={<Documentos />} />
                    <Route path="/contatos" element={<Contatos />} />
                    <Route path="/comunicacoes" element={<Comunicacoes />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="/erros" element={<Erros />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </RuntimeErrorBoundary>
);

export default App;
