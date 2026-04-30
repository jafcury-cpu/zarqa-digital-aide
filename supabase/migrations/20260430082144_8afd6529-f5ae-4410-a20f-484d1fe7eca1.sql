CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  source TEXT NOT NULL DEFAULT 'unknown',
  severity TEXT NOT NULL DEFAULT 'error',
  route TEXT,
  user_agent TEXT,
  request_id TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own error_logs"
ON public.error_logs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_error_logs_user_created ON public.error_logs(user_id, created_at DESC);