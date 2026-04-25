import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BRAND, SITE_DESCRIPTION, useDocumentTitle } from "@/hooks/use-document-title";

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

function Page({ title }: { title?: string }) {
  useDocumentTitle(title);
  return null;
}

function getMeta(selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.getAttribute("content") ?? "";
}

const routes = [
  { path: "/dashboard", title: "Dashboard" },
  { path: "/chat", title: "Chat" },
  { path: "/financeiro", title: "Financeiro" },
  { path: "/saude", title: "Saúde" },
  { path: "/documentos", title: "Documentos" },
  { path: "/contatos", title: "Contatos" },
  { path: "/comunicacoes", title: "Comunicações" },
  { path: "/configuracoes", title: "Configurações" },
  { path: "/login", title: "Login" },
  { path: "/reset-password", title: "Recuperar acesso" },
  { path: "/404", title: "Página não encontrada" },
];

describe("useDocumentTitle — meta tags por rota", () => {
  for (const route of routes) {
    it(`atualiza title e meta tags para ${route.path}`, () => {
      render(<Page title={route.title} />);

      const expectedTitle = `${route.title} · ${BRAND}`;
      expect(document.title).toBe(expectedTitle);
      expect(getMeta('meta[property="og:title"]')).toBe(expectedTitle);
      expect(getMeta('meta[name="twitter:title"]')).toBe(expectedTitle);

      // Descrição padrão única em todas as variantes
      expect(getMeta('meta[name="description"]')).toBe(SITE_DESCRIPTION);
      expect(getMeta('meta[property="og:description"]')).toBe(SITE_DESCRIPTION);
      expect(getMeta('meta[name="twitter:description"]')).toBe(SITE_DESCRIPTION);
    });
  }

  it("description, og:description e twitter:description são idênticas em todas as rotas", () => {
    const collected = routes.map((route) => {
      cleanup();
      document.head.innerHTML = "";
      ensureMeta('meta[name="description"]', "name", "description");
      ensureMeta('meta[property="og:description"]', "property", "og:description");
      ensureMeta('meta[name="twitter:description"]', "name", "twitter:description");
      ensureMeta('meta[property="og:title"]', "property", "og:title");
      ensureMeta('meta[name="twitter:title"]', "name", "twitter:title");
      render(<Page title={route.title} />);
      return {
        d: getMeta('meta[name="description"]'),
        og: getMeta('meta[property="og:description"]'),
        tw: getMeta('meta[name="twitter:description"]'),
      };
    });

    for (const c of collected) {
      expect(c.d).toBe(SITE_DESCRIPTION);
      expect(c.og).toBe(SITE_DESCRIPTION);
      expect(c.tw).toBe(SITE_DESCRIPTION);
    }
  });

  it("usa apenas a marca quando título não é informado", () => {
    render(<Page />);
    expect(document.title).toBe(BRAND);
    expect(getMeta('meta[property="og:title"]')).toBe(BRAND);
    expect(getMeta('meta[name="twitter:title"]')).toBe(BRAND);
    expect(getMeta('meta[name="description"]')).toBe(SITE_DESCRIPTION);
  });
});
