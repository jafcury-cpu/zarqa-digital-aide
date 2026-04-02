DELETE FROM public.messages WHERE role NOT IN ('user', 'assistant');

ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS messages_role_check;

ALTER TABLE public.messages
ADD CONSTRAINT messages_role_check
CHECK (role IN ('user', 'assistant'));