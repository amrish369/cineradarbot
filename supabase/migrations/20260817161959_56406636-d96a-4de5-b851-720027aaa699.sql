SELECT setval('public.movies_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.movies), 1), true);

ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS file_size bigint;

ALTER TABLE public.movies
ADD COLUMN IF NOT EXISTS file_kind text NOT NULL DEFAULT 'video';

UPDATE public.movies
SET file_kind = 'video'
WHERE file_kind IS NULL;

ALTER TABLE public.movies
DROP CONSTRAINT IF EXISTS movies_file_kind_check;

ALTER TABLE public.movies
ADD CONSTRAINT movies_file_kind_check
CHECK (file_kind IN ('video', 'document'));

ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS storage_chat_id bigint,
  ADD COLUMN IF NOT EXISTS storage_message_id bigint;

ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS tmdb_id INTEGER,
  ADD COLUMN IF NOT EXISTS imdb_id TEXT,
  ADD COLUMN IF NOT EXISTS original_title TEXT,
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS backdrop_url TEXT,
  ADD COLUMN IF NOT EXISTS overview TEXT,
  ADD COLUMN IF NOT EXISTS genres TEXT,
  ADD COLUMN IF NOT EXISTS runtime INTEGER,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[],
  ADD COLUMN IF NOT EXISTS search_text TEXT,
  ADD COLUMN IF NOT EXISTS tmdb_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_indexed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS movies_tmdb_id_idx ON public.movies (tmdb_id);
CREATE INDEX IF NOT EXISTS movies_search_text_idx ON public.movies USING gin (to_tsvector('simple', coalesce(search_text, '')));
CREATE INDEX IF NOT EXISTS movies_aliases_idx ON public.movies USING gin (aliases);
CREATE INDEX IF NOT EXISTS movies_file_id_idx ON public.movies (file_id);
CREATE INDEX IF NOT EXISTS movies_storage_msg_idx ON public.movies (storage_chat_id, storage_message_id);