CREATE TABLE IF NOT EXISTS public.bot_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - bot_settings" ON public.bot_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.broadcast_logs (
  id bigserial PRIMARY KEY,
  total int NOT NULL DEFAULT 0,
  success int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  blocked int NOT NULL DEFAULT 0,
  deleted int NOT NULL DEFAULT 0,
  time_ms int NOT NULL DEFAULT 0,
  admin_id bigint,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.broadcast_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.broadcast_logs_id_seq TO service_role;
ALTER TABLE public.broadcast_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - broadcast_logs" ON public.broadcast_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.daily_sent_movies (
  tmdb_id bigint PRIMARY KEY,
  kind text NOT NULL,
  sent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
);
GRANT ALL ON public.daily_sent_movies TO service_role;
ALTER TABLE public.daily_sent_movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - daily_sent_movies" ON public.daily_sent_movies FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.bot_settings (key, value)
VALUES ('storage_channel_id', to_jsonb(-1004299446417::bigint))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.bot_settings (key, value)
VALUES ('migration_progress', '{"running":false,"last_id":0,"done":0,"failed":0,"total":0,"started_at":null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.bot_tokens (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  bot_username TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_tokens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot_tokens_id_seq TO service_role;
ALTER TABLE public.bot_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - bot_tokens" ON public.bot_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.admin_allowlist (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_allowlist TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_allowlist_id_seq TO service_role;
ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - admin_allowlist" ON public.admin_allowlist FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.activity_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.activity_logs_id_seq TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - activity_logs" ON public.activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_bot_tokens_active ON public.bot_tokens(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.delete_queue (
  id BIGSERIAL PRIMARY KEY,
  bot_id BIGINT NULL,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  delete_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delete_queue_due ON public.delete_queue (delete_at);
GRANT ALL ON public.delete_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.delete_queue_id_seq TO service_role;
ALTER TABLE public.delete_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only - delete_queue" ON public.delete_queue;
CREATE POLICY "service role only - delete_queue" ON public.delete_queue
  TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pending_join_actions (
  user_id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.pending_join_actions TO service_role;
ALTER TABLE public.pending_join_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only - pending_join_actions" ON public.pending_join_actions;
CREATE POLICY "service role only - pending_join_actions" ON public.pending_join_actions
  TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.group_membership (
  telegram_id bigint PRIMARY KEY,
  main_joined boolean NOT NULL DEFAULT false,
  backup_joined boolean NOT NULL DEFAULT false,
  channel_joined boolean NOT NULL DEFAULT false,
  last_checked timestamp with time zone,
  last_invited timestamp with time zone,
  last_reminded timestamp with time zone,
  reminder_count integer NOT NULL DEFAULT 0,
  blocked boolean NOT NULL DEFAULT false,
  last_error text,
  started boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.group_membership TO service_role;
ALTER TABLE public.group_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - group_membership" ON public.group_membership FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS group_membership_pending_idx ON public.group_membership (main_joined, last_reminded);