import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY")!;

    // User-scoped client — RLS will enforce ownership of message/reply rows
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    const { message_id } = await req.json();
    if (!message_id || typeof message_id !== "string") {
      return new Response(
        JSON.stringify({ error: "message_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // RLS restricts this to the authenticated user's own messages
    const { data: message, error: msgError } = await supabase
      .from("communication_messages")
      .select("*")
      .eq("id", message_id)
      .single();

    if (msgError || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const channelLabel: Record<string, string> = {
      whatsapp: "WhatsApp",
      email: "E-mail",
      instagram: "Instagram Direct",
      linkedin: "LinkedIn",
      facebook: "Facebook Messenger",
    };

    const systemPrompt = `Você é a secretária executiva do ZARQA, um assistente pessoal de alto nível.
Sua tarefa é sugerir uma resposta profissional, cordial e objetiva para a mensagem recebida.
A resposta deve ser adequada ao canal de comunicação (${channelLabel[message.channel] || message.channel}).
Responda sempre em português brasileiro. Seja breve mas educado.
Se a mensagem exigir ação do usuário, mencione que ele será informado.`;

    const userPrompt = `Canal: ${channelLabel[message.channel] || message.channel}
Remetente: ${message.sender_name}${message.sender_handle ? ` (${message.sender_handle})` : ""}
${message.subject ? `Assunto: ${message.subject}` : ""}
Mensagem: ${message.content}

Sugira uma resposta adequada:`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("suggest-reply AI gateway error:", status);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar sugestão." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const suggestion =
      aiData.choices?.[0]?.message?.content || "Não foi possível gerar sugestão.";

    const { data: reply, error: replyError } = await supabase
      .from("communication_replies")
      .insert({
        user_id: userId,
        message_id: message.id,
        ai_suggestion: suggestion,
        status: "suggested",
      })
      .select()
      .single();

    if (replyError) {
      console.error("suggest-reply insert error:", replyError);
      return new Response(
        JSON.stringify({ error: "Falha ao salvar sugestão." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-reply error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
