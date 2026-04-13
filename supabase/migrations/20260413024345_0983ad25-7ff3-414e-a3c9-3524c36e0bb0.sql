
ALTER TABLE public.contacts ADD COLUMN birthday DATE;

CREATE TABLE public.important_dates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'anual',
  remind_days_before INTEGER NOT NULL DEFAULT 3,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.important_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own important_dates"
  ON public.important_dates FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_important_dates_updated_at
  BEFORE UPDATE ON public.important_dates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
