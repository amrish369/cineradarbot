-- Instagram gate configuration and tracking
-- Add to bot_settings table (key-value pairs)
-- instagram_gate_enabled: boolean
-- instagram_username: string (e.g. "cineradarai_official")

-- Track user Instagram follow verification
CREATE TABLE IF NOT EXISTS public.instagram_follows (
  user_id BIGINT PRIMARY KEY,
  username TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_code TEXT NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'self', -- 'self' or 'meta_api'
  meta_verified BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.instagram_follows TO service_role;
ALTER TABLE public.instagram_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - instagram_follows" ON public.instagram_follows FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_instagram_follows_user ON public.instagram_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_follows_verified ON public.instagram_follows (meta_verified, verified_at DESC);

-- Add instagram_verified column to group_membership if not exists
ALTER TABLE public.group_membership
  ADD COLUMN IF NOT EXISTS instagram_verified BOOLEAN NOT NULL DEFAULT false;
