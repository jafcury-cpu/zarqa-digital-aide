
-- Communications Hub: incoming messages from n8n webhooks
CREATE TABLE public.communication_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  sender_name TEXT NOT NULL,
  sender_handle TEXT,
  subject TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  external_id TEXT,
  metadata JSONB DEFAULT '{}',
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own communication_messages"
  ON public.communication_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_comm_messages_channel ON public.communication_messages(channel);
CREATE INDEX idx_comm_messages_status ON public.communication_messages(status);

-- AI-suggested replies
CREATE TABLE public.communication_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES public.communication_messages(id) ON DELETE CASCADE,
  ai_suggestion TEXT NOT NULL,
  approved_content TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own communication_replies"
  ON public.communication_replies FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_communication_messages_updated_at
  BEFORE UPDATE ON public.communication_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_communication_replies_updated_at
  BEFORE UPDATE ON public.communication_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
