ALTER TABLE public.rush_time_slots
ADD COLUMN session_type text NOT NULL DEFAULT 'formal'
CHECK (session_type IN ('early', 'formal'));