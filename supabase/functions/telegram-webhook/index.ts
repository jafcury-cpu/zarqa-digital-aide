import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const PARSE_PROMPT = `Você é um parser de mensagens de despesas pessoais em português.
Analise a mensagem e extraia a transação financeira.
Retorne SOMENTE JSON (sem markdown):
{"description":"...","amount":0,"category":"...","date":"YYYY-MM-DD","status":"pago"}

Regras:
- amount negativo = despesa, positivo = receita
- category: Moradia | Saúde | Transporte | Educação | Lazer | Alimentação | Receitas | Outros
- date: data de hoje se não informada
- Se a mensagem não for uma despesa/receita, retorne {"skip":true}

Exemplos:
"gastei 50 no almoço" → {"description":"Almoço","amount":-50,"category":"Alimentação","date":"hoje","status":"pago"}
"uber 32" → {"description":"Uber","amount":-32,"category":"Transporte","date":"hoje","status":"pago"}
"recebi 1000 de dividendos" → {"description":"Dividendos","amount":1000,"category":"Receitas","date":"hoje","status":"pago"}`;

const txSchema = z.object({
  description: z.string().trim().min(1).max(255),
  amount: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  category: z.enum([
    "Moradia",
    "Saúde",
    "Transporte",
    "Educação",
    "Lazer",
    "Alimentação",
    "Receitas",
    "Outros",
  ]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pago", "pendente", "atrasado"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Validate secret token sent by Telegram
    const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
    if (!secretToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("user_id, telegram_chat_id")
      .eq("telegram_bot_token", secretToken)
      .maybeSingle();

    if (!settings?.user_id) {
      return new Response(JSON.stringify({ error: "Bot token not registered" }), { status: 403 });
    }

    const update = await req.json();
    const message = update?.message;
    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (settings.telegram_chat_id && String(message.chat?.id) !== settings.telegram_chat_id) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not set");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: PARSE_PROMPT.replace(/hoje/g, today) },
          { role: "user", content: message.text },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI error:", aiResponse.status);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    if (parsed.skip) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Coerce amount to number before validation (AI may emit string)
    const candidate = {
      description: typeof parsed.description === "string" ? parsed.description : String(message.text).slice(0, 100),
      amount: typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount),
      category: parsed.category,
      date: typeof parsed.date === "string" ? parsed.date : today,
      status: parsed.status ?? "pago",
    };

    const validated = txSchema.safeParse(candidate);
    if (!validated.success) {
      console.error("telegram-webhook validation failed:", validated.error.flatten());
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: settings.user_id,
      description: validated.data.description,
      amount: validated.data.amount,
      category: validated.data.category,
      date: validated.data.date,
      status: validated.data.status,
      source: "telegram",
    });

    if (insertError) {
      console.error("telegram-webhook insert error:", insertError);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("telegram-webhook error:", e);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
});
