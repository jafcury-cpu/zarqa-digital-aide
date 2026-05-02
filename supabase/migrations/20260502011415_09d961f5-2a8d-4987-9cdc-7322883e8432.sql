CREATE TABLE public.ingest_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  auth_mode text NOT NULL,
  status_code integer NOT NULL,
  inserted_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  total_received integer NOT NULL DEFAULT 0,
  error_message text,
  rejected_details jsonb DEFAULT '[]'::jsonb,
  request_id text,
  duration_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ingest_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ingest_logs"
ON public.ingest_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own ingest_logs"
ON public.ingest_logs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_ingest_logs_user_created ON public.ingest_logs (user_id, created_at DESC);