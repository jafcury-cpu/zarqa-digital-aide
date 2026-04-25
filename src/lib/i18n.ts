/**
 * Dicionário central de textos da interface (pt-BR).
 *
 * Como usar:
 *   import { t } from "@/lib/i18n";
 *   <p>{t("dashboard.eyebrow.briefing")}</p>
 *
 * Como adicionar novos textos:
 *   1. Crie a chave em `dictionary` abaixo, agrupada por área (dashboard.*, chat.*, etc.).
 *   2. Use `t("sua.chave")` no componente.
 *   3. Se a chave não existir, `t()` retorna a própria chave (facilita identificar buracos).
 *
 * Convenções:
 *   - Sempre em pt-BR.
 *   - Nome da marca centralizado em `brand.name` ("Luize").
 *   - Nunca incluir sobrenome ou cargo em textos visíveis.
 */

export const dictionary = {
  // Marca
  "brand.name": "Luize",
  "brand.panel": "Painel",
  "brand.tagline": "Painel privado para coordenar agenda, finanças, saúde e documentos.",

  // Comum
  "common.singleUserMode": "Modo de usuário único",
  "common.loading": "Carregando...",
  "common.save": "Salvar",
  "common.cancel": "Cancelar",
  "common.search": "Buscar",

  // Layout / sidebar
  "layout.controlSurface": "Painel de controle da Luize",
  "sidebar.section.operacao": "Operação",

  // Dashboard
  "dashboard.title": "Dashboard",
  "dashboard.eyebrow.briefing": "Briefing diário",
  "dashboard.eyebrow.agenda": "Agenda",
  "dashboard.eyebrow.riskRadar": "Radar de risco",
  "dashboard.eyebrow.cashPressure": "Pressão de caixa",
  "dashboard.eyebrow.healthTelemetry": "Telemetria de saúde",
  "dashboard.eyebrow.executivePulse": "Pulso executivo",

  // Chat
  "chat.title": "Chat",
  "chat.eyebrow.messaging": "Mensagens",
  "chat.eyebrow.deliveryNotes": "Notas de entrega",

  // Financeiro
  "financeiro.title": "Financeiro",
  "financeiro.eyebrow.cashPosition": "Posição de caixa",
  "financeiro.eyebrow.reconciliation": "Conciliação",
  "financeiro.eyebrow.dueSoon": "Próximos vencimentos",
  "financeiro.eyebrow.allocationView": "Alocação",
  "financeiro.eyebrow.timeline": "Linha do tempo",
  "financeiro.eyebrow.ledger": "Razão",
  "financeiro.eyebrow.capabilities": "Recursos",
  "financeiro.eyebrow.deepDive": "Visão detalhada",

  // Saúde
  "saude.title": "Saúde",
  "saude.eyebrow.healthScore": "Score de saúde",
  "saude.eyebrow.metrics": "Métricas",
  "saude.eyebrow.weeklyTrend": "Tendência semanal",

  // Documentos
  "documentos.title": "Documentos",
  "documentos.eyebrow.retrieval": "Recuperação de documentos",
  "documentos.eyebrow.repository": "Repositório",

  // Contatos
  "contatos.title": "Contatos",
  "contatos.eyebrow.reminders": "Lembretes",
  "contatos.eyebrow.contacts": "Contatos",

  // Configurações
  "configuracoes.title": "Configurações",
  "configuracoes.eyebrow.controlSettings": "Configurações de controle",
  "configuracoes.eyebrow.snapshot": "Snapshot",

  // Login / Reset
  "login.kicker.executiveTerminal": "Terminal executivo",
  "login.kicker.privatePanel": "Painel privado",
  "login.kicker.privateAccess": "Acesso privado",
  "reset.kicker.accountRecovery": "Recuperação de conta",
  "reset.kicker.operationalSecurity": "Segurança operacional",
  "reset.kicker.accessUpdated": "Acesso atualizado",

  // 404
  "notFound.kicker.routingError": "Erro de roteamento",
} as const;

export type DictionaryKey = keyof typeof dictionary;

/**
 * Retorna o texto pt-BR para a chave informada.
 * Se a chave não existir, retorna a própria chave (visível em desenvolvimento).
 */
export function t(key: DictionaryKey | (string & {})): string {
  const value = (dictionary as Record<string, string>)[key];
  if (value === undefined) {
    if (import.meta.env?.DEV) {
      console.warn(`[i18n] Chave ausente no dicionário: "${key}"`);
    }
    return key;
  }
  return value;
}
