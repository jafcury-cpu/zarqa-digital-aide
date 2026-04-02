import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_ALLOWED_HOST_PATTERNS = ["n8n.cloud", "*.n8n.cloud"];
const REQUEST_TIMEOUT_MS = 8000;
const MAX_HISTORY_ITEMS = 30;
const MAX_MESSAGE_LENGTH = 4000;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  source: z.string().trim().min(1).max(100).optional().default("zarqa-chat"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
      }),
    )
    .max(MAX_HISTORY_ITEMS)
    .optional()
    .default([]),
});

const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getAllowedHostPatterns() {
  const configured = Deno.env.get("CHAT_WEBHOOK_ALLOWED_DOMAINS")
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_ALLOWED_HOST_PATTERNS;
}

function isPrivateOrUnsafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(normalized)) {
    return true;
  }

  if (!ipv4Pattern.test(normalized)) {
    return false;
  }

  const octets = normalized.split(".").map(Number);
  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function hostnameMatchesPattern(hostname: string, pattern: string) {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return normalizedHost !== suffix && normalizedHost.endsWith(`.${suffix}`);
  }

  return normalizedHost === normalizedPattern;
}

function validateWebhookUrl(value: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("Webhook URL inválida.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Somente webhooks com HTTPS são permitidos.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Webhook URL não pode incluir credenciais embutidas.");
  }

  if (isPrivateOrUnsafeHostname(parsedUrl.hostname)) {
    throw new Error("O domínio do webhook não é permitido.");
  }

  const allowedPatterns = getAllowedHostPatterns();
  const isAllowed = allowedPatterns.some((pattern) => hostnameMatchesPattern(parsedUrl.hostname, pattern));

  if (!isAllowed) {
    throw new Error("O domínio do webhook não está na allowlist configurada.");
  }

  return parsedUrl;
}

async function extractReply(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const reply = payload.reply ?? payload.message ?? payload.output ?? payload.response;
    return typeof reply === "string" ? reply : JSON.stringify(payload);
  }

  return response.text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabasePublishableKey = getEnv("SUPABASE_PUBLISHABLE_KEY");

    const supabase = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedBody = bodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return new Response(JSON.stringify({ error: parsedBody.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { data: settingsRow, error: settingsError } = await supabase
      .from("settings")
      .select("webhook_url")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError) {
      throw new Error(`Falha ao carregar configurações: ${settingsError.message}`);
    }

    if (!settingsRow?.webhook_url) {
      return new Response(
        JSON.stringify({
          reply: "Webhook ainda não configurado. Defina a URL em Configurações para ativar respostas do n8n.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const webhookUrl = validateWebhookUrl(settingsRow.webhook_url);
    const { message, history, source } = parsedBody.data;
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userId, source, history }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Webhook retornou ${response.status}: ${errorBody || "sem detalhes"}`);
    }

    const reply = (await extractReply(response)).trim();
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar mensagem ao webhook.";
    const status = error instanceof DOMException && error.name === "TimeoutError" ? 504 : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});