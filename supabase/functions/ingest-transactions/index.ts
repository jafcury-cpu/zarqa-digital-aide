import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-luize-api-key, x-luize-user-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type IncomingTransaction = {
  description?: unknown;
  amount?: unknown;
  date?: unknown;
  category?: unknown;
  status?: unknown;
  external_id?: unknown;
  source?: unknown;
};

type NormalizedTransaction = {
  description: string;
  amount: number;
  date: string;
  category: string;
  status: string;
  external_id: string | null;
  source: string;
};

const ALLOWED_STATUS = new Set(["pago", "pendente", "atrasado", "agendado"]);
const ALLOWED_CATEGORIES = new Set([
  "Moradia",
  "Saúde",
  "Transporte",
  "Educação",
  "Lazer",
  "Alimentação",
  "Receitas",
  "Outros",
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD/MM/YYYY ou DD/MM/YY
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m}-${d}`;
  }
  // ISO completo
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // "1.234,56" ou "1234.56" ou "-R$ 1.234,56"
    const cleaned = value
      .replace(/[R$\s]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const num = Number(cleaned);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function normalizeTransaction(raw: IncomingTransaction): { ok: true; tx: NormalizedTransaction } | { ok: false; error: string } {
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description || description.length > 500) return { ok: false, error: "description inválida (1-500 chars)" };

  const amount = normalizeAmount(raw.amount);
  if (amount === null) return { ok: false, error: "amount inválido" };

  const date = normalizeDate(raw.date);
  if (!date) return { ok: false, error: "date inválida (use YYYY-MM-DD ou DD/MM/YYYY)" };

  const rawCategory = typeof raw.category === "string" ? raw.category.trim() : "Outros";
  const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : "Outros";

  const rawStatus = typeof raw.status === "string" ? raw.status.toLowerCase().trim() : "pago";
  const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : "pago";

  const externalIdRaw = raw.external_id;
  const external_id = typeof externalIdRaw === "string" && externalIdRaw.trim().length > 0 && externalIdRaw.length <= 200
    ? externalIdRaw.trim()
    : null;

  const sourceRaw = typeof raw.source === "string" ? raw.source.trim() : "webhook";
  const source = sourceRaw.length > 0 && sourceRaw.length <= 50 ? sourceRaw : "webhook";

  return { ok: true, tx: { description, amount, date, category, status, external_id, source } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sharedApiKey = Deno.env.get("LUIZE_INGEST_API_KEY") ?? null;

  // === Autenticação: dois modos ===
  // 1) JWT do usuário (frontend logado) → respeita RLS automaticamente.
  // 2) X-Luize-Api-Key + X-Luize-User-Id (sistema externo: Tesouro Brilhante, n8n, Zapier).
  let userId: string | null = null;
  let dbClient;

  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("x-luize-api-key");
  const externalUserId = req.headers.get("x-luize-user-id");

  if (authHeader?.startsWith("Bearer ") && !apiKeyHeader) {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return jsonResponse({ error: "JWT inválido ou expirado" }, 401);
    userId = user.id;
    dbClient = client;
  } else if (apiKeyHeader && externalUserId) {
    if (!sharedApiKey) {
      return jsonResponse({ error: "LUIZE_INGEST_API_KEY não configurada no servidor" }, 503);
    }
    if (apiKeyHeader !== sharedApiKey) {
      return jsonResponse({ error: "API key inválida" }, 401);
    }
    if (!/^[0-9a-f-]{36}$/i.test(externalUserId)) {
      return jsonResponse({ error: "x-luize-user-id deve ser um UUID" }, 400);
    }
    userId = externalUserId;
    // Service role bypassa RLS — escopamos manualmente por user_id na inserção.
    dbClient = createClient(supabaseUrl, serviceKey);
  } else {
    return jsonResponse(
      { error: "Forneça Authorization: Bearer <jwt> OU os headers X-Luize-Api-Key + X-Luize-User-Id" },
      401,
    );
  }

  // === Parse + validação do payload ===
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { transactions?: unknown })?.transactions)
      ? (payload as { transactions: unknown[] }).transactions
      : null;

  if (!list || list.length === 0) {
    return jsonResponse({ error: "Envie um array de transactions ou { transactions: [...] }" }, 400);
  }
  if (list.length > 500) {
    return jsonResponse({ error: "Máximo de 500 transações por chamada" }, 413);
  }

  const accepted: NormalizedTransaction[] = [];
  const rejected: { index: number; error: string }[] = [];
  list.forEach((raw, index) => {
    const result = normalizeTransaction((raw ?? {}) as IncomingTransaction);
    if (result.ok) accepted.push(result.tx);
    else rejected.push({ index, error: result.error });
  });

  if (accepted.length === 0) {
    return jsonResponse({ error: "Nenhuma transação válida", rejected }, 422);
  }

  // === Deduplicação por external_id (quando fornecido) ===
  const externalIds = accepted.map((t) => t.external_id).filter((v): v is string => !!v);
  let existingExternalIds = new Set<string>();
  if (externalIds.length > 0) {
    const { data: existing } = await dbClient
      .from("transactions")
      .select("external_id")
      .eq("user_id", userId)
      .in("external_id", externalIds);
    existingExternalIds = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));
  }

  const toInsert = accepted
    .filter((t) => !t.external_id || !existingExternalIds.has(t.external_id))
    .map((t) => ({ ...t, user_id: userId }));

  const skipped = accepted.length - toInsert.length;

  if (toInsert.length === 0) {
    return jsonResponse({ inserted: 0, skipped, rejected, message: "Todas as transações já existiam (external_id)" });
  }

  const { data: inserted, error: insertError } = await dbClient
    .from("transactions")
    .insert(toInsert)
    .select("id, external_id");

  if (insertError) {
    console.error("[ingest-transactions] insert error", insertError);
    return jsonResponse({ error: insertError.message, rejected }, 500);
  }

  return jsonResponse({
    inserted: inserted?.length ?? 0,
    skipped,
    rejected,
    ids: inserted?.map((r: { id: string }) => r.id) ?? [],
  });
});
