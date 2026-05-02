-- Adiciona suporte a importação/reconciliação de transações via webhook externo
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Garante unicidade do external_id por usuário (permite NULL para transações manuais)
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_external_id_key
  ON public.transactions (user_id, external_id)
  WHERE external_id IS NOT NULL;

-- Índice para acelerar buscas por origem
CREATE INDEX IF NOT EXISTS transactions_user_source_idx
  ON public.transactions (user_id, source);