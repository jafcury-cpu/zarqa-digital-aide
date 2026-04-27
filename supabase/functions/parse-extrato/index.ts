import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um parser especializado em extratos bancários brasileiros.
Analise o texto e extraia TODAS as transações financeiras encontradas.
Para cada transação retorne:
- description: descrição curta da transação
- amount: valor numérico (negativo = despesa, positivo = receita/crédito)
- date: data no formato YYYY-MM-DD (use o ano atual se não houver)
- category: uma de: Moradia, Saúde, Transporte, Educação, Lazer, Alimentação, Receitas, Outros
- status: "pago" (transações passadas) ou "pendente" (futuras)

Retorne SOMENTE JSON válido, sem markdown:
{"transactions":[{"description":"...","amount":0,"date":"YYYY-MM-DD","category":"...","status":"pago"}]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text } = await req.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extrato:\n${text.slice(0, 8000)}` },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      console.error("parse-extrato AI gateway error:", aiResponse.status);
      return new Response(
        JSON.stringify({ error: "Falha ao processar extrato." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "{}";

    let parsed: { transactions?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { transactions: [] };
    }

    return new Response(JSON.stringify({ transactions: parsed.transactions ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-extrato error:", e);
    return new Response(JSON.stringify({ error: "Erro ao processar extrato" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
