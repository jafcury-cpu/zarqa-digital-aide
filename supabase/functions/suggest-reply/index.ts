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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to get user from auth header, fallback to service role for testing
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const anonClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!
      );
      const {
        data: { user },
      } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id ?? null;
    }

    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(
        JSON.stringify({ error: "message_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the message (filter by user if authenticated)
    let query = supabase
      .from("communication_messages")
      .select("*")
      .eq("id", message_id);
    if (userId) query = query.eq("user_id", userId);
    const { data: message, error: msgError } = await query.single();

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
          model: "google/gemini-3-flash-preview",
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
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const suggestion =
      aiData.choices?.[0]?.message?.content || "Não foi possível gerar sugestão.";

    // Save the suggestion
    const { data: reply, error: replyError } = await supabase
      .from("communication_replies")
      .insert({
        user_id: userId || message.user_id,
        message_id: message.id,
        ai_suggestion: suggestion,
        status: "suggested",
      })
      .select()
      .single();

    if (replyError) throw replyError;

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-reply error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
