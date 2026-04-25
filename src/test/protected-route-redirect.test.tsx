import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock do client Supabase: sem sessão autenticada
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      auth: {
        onAuthStateChange: (_cb: unknown) => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        getSession: () => Promise.resolve({ data: { session: null } }),
        signOut: () => Promise.resolve({ error: null }),
      },
    },
  };
});

import { AuthProvider } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";

function LoginStub() {
  return <div data-testid="login-page">LOGIN PAGE</div>;
}

function ProtectedStub({ label }: { label: string }) {
  return <div data-testid={`protected-${label}`}>{label} CONTENT</div>;
}

function renderApp(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginStub />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ProtectedStub label="dashboard" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ProtectedStub label="chat" />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ProtectedRoute — redireciona para /login quando não autenticado", () => {
  it("redireciona /dashboard para /login quando não há sessão", async () => {
    renderApp("/dashboard");
    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("protected-dashboard")).not.toBeInTheDocument();
  });

  it("redireciona /chat para /login quando não há sessão", async () => {
    renderApp("/chat");
    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("protected-chat")).not.toBeInTheDocument();
  });
});
