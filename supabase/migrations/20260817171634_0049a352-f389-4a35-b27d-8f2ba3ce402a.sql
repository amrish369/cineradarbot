ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS content_kind text,
  ADD COLUMN IF NOT EXISTS season integer,
  ADD COLUMN IF NOT EXISTS episode_start integer,
  ADD COLUMN IF NOT EXISTS episode_end integer,
  ADD COLUMN IF NOT EXISTS is_combined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clean_caption text,
  ADD COLUMN IF NOT EXISTS raw_caption text,
  ADD COLUMN IF NOT EXISTS metadata_version integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS movies_metadata_version_idx ON public.movies (metadata_version, id);
CREATE INDEX IF NOT EXISTS movies_series_idx ON public.movies (content_kind, season, episode_start);