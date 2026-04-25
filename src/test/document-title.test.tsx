import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useDocumentTitle } from "@/hooks/use-document-title";

const BRAND = "Luize Blond";
const DEFAULT_DESCRIPTION =
  "ZARQA ٢٨ — Chief of Staff Digital. Painel executivo privado para coordenar agenda, finanças, saúde e documentos.";

function ensureMeta(selector: string, attr: "name" | "property", key: string) {
  if (!document.querySelector(selector)) {
    const m = document.createElement("meta");
    m.setAttribute(attr, key);
    m.setAttribute("content", "");
    document.head.appendChild(m);
  }
}

beforeEach(() => {
  cleanup();
  document.head.innerHTML = "";
  ensureMeta('meta[name="description"]', "name", "description");
  ensureMeta('meta[property="og:title"]', "property", "og:title");
  ensureMeta('meta[property="og:description"]', "property", "og:description");
  ensureMeta('meta[name="twitter:title"]', "name", "twitter:title");
  ensureMeta('meta[name="twitter:description"]', "name", "twitter:description");
});

function Page({ title, description }: { title?: string; description?: string }) {
  useDocumentTitle(title, description);
  return null;
}

function getMeta(selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.getAttribute("content") ?? "";
}

const routes = [
  { path: "/dashboard", title: "Dashboard", description: "Resumo executivo do dia — Luize Blond Chief of Staff Digital" },
  { path: "/chat", title: "Chat", description: "Delegue, consulte e acompanhe — Luize Blond" },
  { path: "/financeiro", title: "Financeiro", description: "Liquidez, gastos e vencimentos — Luize Blond" },
  { path: "/saude", title: "Saúde", description: "Biometria e consistência diária — Luize Blond" },
  { path: "/documentos", title: "Documentos", description: "Busca, upload e memória operacional — Luize Blond" },
  { path: "/contatos", title: "Contatos", description: "Família, aniversários e datas importantes — Luize Blond" },
  { path: "/comunicacoes", title: "Comunicações", description: "Hub de canais e secretária IA — Luize Blond" },
  { path: "/configuracoes", title: "Configurações", description: "Webhook, timezone e preferências — Luize Blond" },
  { path: "/login", title: "Login", description: "Acesso privado — Luize Blond Chief of Staff Digital" },
  { path: "/reset-password", title: "Recuperar acesso", description: "Recuperação de acesso — Luize Blond" },
  { path: "/404", title: "Página não encontrada", description: "Rota inexistente — Luize Blond" },
];

describe("useDocumentTitle — meta tags por rota", () => {
  for (const route of routes) {
    it(`atualiza title e meta tags para ${route.path}`, () => {
      render(<Page title={route.title} description={route.description} />);

      const expectedTitle = `${route.title} · ${BRAND}`;
      expect(document.title).toBe(expectedTitle);
      expect(getMeta('meta[name="description"]')).toBe(route.description);
      expect(getMeta('meta[property="og:title"]')).toBe(expectedTitle);
      expect(getMeta('meta[property="og:description"]')).toBe(route.description);
      expect(getMeta('meta[name="twitter:title"]')).toBe(expectedTitle);
      expect(getMeta('meta[name="twitter:description"]')).toBe(route.description);
    });
  }

  it("usa descrição padrão quando description não é informada", () => {
    render(<Page title="Algum lugar" />);
    expect(document.title).toBe(`Algum lugar · ${BRAND}`);
    expect(getMeta('meta[name="description"]')).toBe(DEFAULT_DESCRIPTION);
    expect(getMeta('meta[property="og:description"]')).toBe(DEFAULT_DESCRIPTION);
    expect(getMeta('meta[name="twitter:description"]')).toBe(DEFAULT_DESCRIPTION);
  });

  it("usa apenas a marca quando título não é informado", () => {
    render(<Page />);
    expect(document.title).toBe(BRAND);
    expect(getMeta('meta[property="og:title"]')).toBe(BRAND);
    expect(getMeta('meta[name="twitter:title"]')).toBe(BRAND);
  });
});
