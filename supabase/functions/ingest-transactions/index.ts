import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m}-${d}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/[R$\s]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const num = Number(cleaned);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

type FieldError = { field: string; error: string; received?: unknown };

/** Limita o eco do valor recebido em respostas de erro (evita vazar payload gigante). */
function preview(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 120 ? value.slice(0, 120) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const json = JSON.stringify(value);
    return json.length > 120 ? json.slice(0, 120) + "…" : JSON.parse(json);
  } catch {
    return String(value).slice(0, 120);
  }
}

function normalizeTransaction(
  raw: IncomingTransaction,
): { ok: true; tx: NormalizedTransaction } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: "_root", error: "item deve ser um objeto", received: preview(raw) }] };
  }

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) {
    errors.push({ field: "description", error: "obrigatória (string não vazia)", received: preview(raw.description) });
  } else if (description.length > 500) {
    errors.push({ field: "description", error: "máximo 500 caracteres", received: `${description.length} chars` });
  }

  const amount = normalizeAmount(raw.amount);
  if (amount === null) {
    errors.push({
      field: "amount",
      error: "deve ser número ou string numérica (ex.: -342.90, \"R$ 1.234,56\")",
      received: preview(raw.amount),
    });
  }

  const date = normalizeDate(raw.date);
  if (!date) {
    errors.push({
      field: "date",
      error: "use YYYY-MM-DD, DD/MM/YYYY ou ISO 8601",
      received: preview(raw.date),
    });
  }

  if (raw.status !== undefined && typeof raw.status === "string") {
    const s = raw.status.toLowerCase().trim();
    if (s.length > 0 && !ALLOWED_STATUS.has(s)) {
      errors.push({
        field: "status",
        error: `valores aceitos: ${Array.from(ALLOWED_STATUS).join(", ")}`,
        received: preview(raw.status),
      });
    }
  }

  if (raw.external_id !== undefined && raw.external_id !== null) {
    if (typeof raw.external_id !== "string" || raw.external_id.length > 200) {
      errors.push({
        field: "external_id",
        error: "deve ser string de até 200 caracteres",
        received: preview(raw.external_id),
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Categoria: preservamos a string crua aqui; o mapeamento + fallback acontece
  // depois (quando já temos o user_id e podemos consultar category_mappings).
  const rawCategoryStr = typeof raw.category === "string" ? raw.category.trim() : "";
  const category = rawCategoryStr.length > 0 ? rawCategoryStr : "Outros";

  const rawStatus = typeof raw.status === "string" ? raw.status.toLowerCase().trim() : "pago";
  const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : "pago";

  const externalIdRaw = raw.external_id;
  const external_id = typeof externalIdRaw === "string" && externalIdRaw.trim().length > 0
    ? externalIdRaw.trim()
    : null;

  const sourceRaw = typeof raw.source === "string" ? raw.source.trim() : "webhook";
  const source = sourceRaw.length > 0 && sourceRaw.length <= 50 ? sourceRaw : "webhook";

  return { ok: true, tx: { description, amount: amount!, date: date!, category, status, external_id, source } };
}

/**
 * Resolve a categoria final para cada transação:
 * 1. Se já é uma categoria interna válida → mantém.
 * 2. Se existe mapeamento do usuário (case-insensitive) → usa o mapeamento.
 * 3. Caso contrário → "Outros".
 * Retorna também a lista de categorias externas que não tinham mapeamento, para diagnóstico.
 */
async function applyCategoryMappings(
  client: SupabaseClient,
  userId: string,
  txs: NormalizedTransaction[],
): Promise<{ unmapped: string[] }> {
  const externalCandidates = Array.from(
    new Set(
      txs
        .map((t) => t.category)
        .filter((c) => !ALLOWED_CATEGORIES.has(c))
        .map((c) => c.toLowerCase()),
    ),
  );

  let mappingByLower = new Map<string, string>();
  if (externalCandidates.length > 0) {
    const { data: mappings } = await client
      .from("category_mappings")
      .select("external_category, internal_category")
      .eq("user_id", userId);
    mappingByLower = new Map(
      (mappings ?? [])
        .filter((m: { internal_category: string }) => ALLOWED_CATEGORIES.has(m.internal_category))
        .map((m: { external_category: string; internal_category: string }) => [
          m.external_category.toLowerCase(),
          m.internal_category,
        ]),
    );
  }

  const unmappedSet = new Set<string>();
  for (const tx of txs) {
    if (ALLOWED_CATEGORIES.has(tx.category)) continue;
    const mapped = mappingByLower.get(tx.category.toLowerCase());
    if (mapped) {
      tx.category = mapped;
    } else {
      unmappedSet.add(tx.category);
      tx.category = "Outros";
    }
  }
  return { unmapped: Array.from(unmappedSet) };
}

async function logCall(
  serviceClient: SupabaseClient,
  entry: {
    user_id: string | null;
    source: string;
    auth_mode: string;
    status_code: number;
    inserted_count: number;
    updated_count: number;
    skipped_count: number;
    rejected_count: number;
    total_received: number;
    error_message: string | null;
    rejected_details: unknown;
    request_id: string;
    duration_ms: number;
  },
) {
  if (!entry.user_id) return;
  try {
    await serviceClient.from("ingest_logs").insert({
      user_id: entry.user_id,
      source: entry.source,
      auth_mode: entry.auth_mode,
      status_code: entry.status_code,
      inserted_count: entry.inserted_count,
      updated_count: entry.updated_count,
      skipped_count: entry.skipped_count,
      rejected_count: entry.rejected_count,
      total_received: entry.total_received,
      error_message: entry.error_message,
      rejected_details: entry.rejected_details ?? [],
      request_id: entry.request_id,
      duration_ms: entry.duration_ms,
    });
  } catch (err) {
    console.error("[ingest-transactions] failed to write ingest_logs", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sharedApiKey = Deno.env.get("LUIZE_INGEST_API_KEY") ?? null;

  // Cliente service role usado SOMENTE para gravar audit log (ingest_logs).
  const auditClient = createClient(supabaseUrl, serviceKey);

  let userId: string | null = null;
  let authMode = "unknown";
  let dbClient: SupabaseClient;

  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("x-luize-api-key");
  const externalUserId = req.headers.get("x-luize-user-id");

  const finish = async (
    body: Record<string, unknown>,
    status: number,
    counts: { inserted: number; skipped: number; rejected: number; total: number; error: string | null; rejectedDetails: unknown; sourceLabel: string },
  ) => {
    await logCall(auditClient, {
      user_id: userId,
      source: counts.sourceLabel,
      auth_mode: authMode,
      status_code: status,
      inserted_count: counts.inserted,
      skipped_count: counts.skipped,
      rejected_count: counts.rejected,
      total_received: counts.total,
      error_message: counts.error,
      rejected_details: counts.rejectedDetails,
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
    });
    return jsonResponse({ ...body, request_id: requestId }, status);
  };

  if (authHeader?.startsWith("Bearer ") && !apiKeyHeader) {
    authMode = "jwt";
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return jsonResponse({ error: "JWT inválido ou expirado", request_id: requestId }, 401);
    }
    userId = user.id;
    dbClient = client;
  } else if (apiKeyHeader && externalUserId) {
    authMode = "api_key";
    if (!sharedApiKey) {
      return jsonResponse({ error: "LUIZE_INGEST_API_KEY não configurada no servidor", request_id: requestId }, 503);
    }
    if (apiKeyHeader !== sharedApiKey) {
      return jsonResponse({ error: "API key inválida", request_id: requestId }, 401);
    }
    if (!/^[0-9a-f-]{36}$/i.test(externalUserId)) {
      return jsonResponse({ error: "x-luize-user-id deve ser um UUID", request_id: requestId }, 400);
    }
    userId = externalUserId;
    dbClient = createClient(supabaseUrl, serviceKey);
  } else {
    return jsonResponse(
      { error: "Forneça Authorization: Bearer <jwt> OU os headers X-Luize-Api-Key + X-Luize-User-Id", request_id: requestId },
      401,
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return finish(
      {
        error: "JSON inválido",
        hint: "Envie um array direto [...] ou um objeto com a chave 'transactions' ou 'data'.",
      },
      400,
      { inserted: 0, skipped: 0, rejected: 0, total: 0, error: "JSON inválido", rejectedDetails: [], sourceLabel: "webhook" },
    );
  }

  // Aceita 3 formatos: [ ... ], { transactions: [...] }, { data: [...] }
  let list: unknown[] | null = null;
  let envelopeUsed: "array" | "transactions" | "data" | null = null;
  let bodyMode: unknown = undefined;
  if (Array.isArray(payload)) {
    list = payload;
    envelopeUsed = "array";
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    bodyMode = obj.mode;
    if (Array.isArray(obj.transactions)) {
      list = obj.transactions;
      envelopeUsed = "transactions";
    } else if (Array.isArray(obj.data)) {
      list = obj.data;
      envelopeUsed = "data";
    }
  }

  // Modo: insert (default) ou upsert. Aceita ?upsert=true ou ?mode=upsert ou { mode: "upsert" }.
  const url = new URL(req.url);
  const queryMode = url.searchParams.get("mode");
  const upsertFlag = url.searchParams.get("upsert");
  const mode: "insert" | "upsert" =
    queryMode === "upsert" ||
    (upsertFlag !== null && upsertFlag !== "false" && upsertFlag !== "0") ||
    (typeof bodyMode === "string" && bodyMode.toLowerCase() === "upsert")
      ? "upsert"
      : "insert";

  if (!list) {
    return finish(
      {
        error: "Formato de payload não reconhecido",
        expected: ["[ ...transactions ]", "{ \"transactions\": [...] }", "{ \"data\": [...] }"],
        received_type: Array.isArray(payload) ? "array" : typeof payload,
      },
      400,
      { inserted: 0, skipped: 0, rejected: 0, total: 0, error: "envelope inválido", rejectedDetails: [], sourceLabel: "webhook" },
    );
  }

  if (list.length === 0) {
    return finish(
      { error: "Lista de transações vazia", envelope: envelopeUsed },
      400,
      { inserted: 0, skipped: 0, rejected: 0, total: 0, error: "lista vazia", rejectedDetails: [], sourceLabel: "webhook" },
    );
  }
  if (list.length > 500) {
    return finish(
      { error: "Máximo de 500 transações por chamada", received: list.length },
      413,
      { inserted: 0, skipped: 0, rejected: 0, total: list.length, error: "excedeu 500", rejectedDetails: [], sourceLabel: "webhook" },
    );
  }

  type RejectedItem = { index: number; errors: FieldError[] };
  const accepted: NormalizedTransaction[] = [];
  const rejected: RejectedItem[] = [];
  list.forEach((raw, index) => {
    const result = normalizeTransaction((raw ?? {}) as IncomingTransaction);
    if (result.ok) accepted.push(result.tx);
    else rejected.push({ index, errors: result.errors });
  });

  // Rótulo de origem para o log: pega do primeiro item válido se existir.
  const sourceLabel = accepted[0]?.source ?? "webhook";

  if (accepted.length === 0) {
    return finish(
      { error: "Nenhuma transação válida", rejected },
      422,
      { inserted: 0, skipped: 0, rejected: rejected.length, total: list.length, error: "todas inválidas", rejectedDetails: rejected, sourceLabel },
    );
  }

  // Aplica mapeamento configurável de categorias externas → internas (fallback "Outros").
  const { unmapped } = await applyCategoryMappings(dbClient, userId!, accepted);

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
    return finish(
      { inserted: 0, skipped, rejected, message: "Todas as transações já existiam (external_id)" },
      200,
      { inserted: 0, skipped, rejected: rejected.length, total: list.length, error: null, rejectedDetails: rejected, sourceLabel },
    );
  }

  const { data: inserted, error: insertError } = await dbClient
    .from("transactions")
    .insert(toInsert)
    .select("id, external_id");

  if (insertError) {
    console.error("[ingest-transactions] insert error", insertError);
    return finish(
      { error: insertError.message, rejected },
      500,
      { inserted: 0, skipped, rejected: rejected.length, total: list.length, error: insertError.message, rejectedDetails: rejected, sourceLabel },
    );
  }

  return finish(
    {
      inserted: inserted?.length ?? 0,
      skipped,
      rejected,
      unmapped_categories: unmapped,
      ids: inserted?.map((r: { id: string }) => r.id) ?? [],
    },
    200,
    { inserted: inserted?.length ?? 0, skipped, rejected: rejected.length, total: list.length, error: null, rejectedDetails: rejected, sourceLabel },
  );
});
