CREATE TABLE public.verify_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  event TEXT NOT NULL,
  movie_id BIGINT,
  day DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.verify_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.verify_events_id_seq TO service_role;

ALTER TABLE public.verify_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only - verify_events" ON public.verify_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX verify_events_day_idx ON public.verify_events (day);
CREATE INDEX verify_events_event_idx ON public.verify_events (event);
CREATE INDEX verify_events_user_idx ON public.verify_events (user_id);