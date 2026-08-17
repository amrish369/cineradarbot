import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseSmart, buildUserCaption } from "./smart-parse.server";
import { qualityFromSize } from "./caption.server";
import { tmdbVerify } from "./tmdb.server";
import { buildSearchText, generateAliases } from "./search.server";

/**
 * One-time (resumable) metadata backfill.
 *
 * Re-parses every already-indexed movie/series row with the smart parser,
 * cleans promotional caption junk, extracts season/episode data, verifies the
 * title against TMDB when possible and regenerates the user-facing caption.
 *
 * It only ever UPDATEs existing rows by primary key — file_id, storage_chat_id
 * and storage_message_id are never touched, and no Telegram file is modified.
 */

export const METADATA_VERSION = 1;

export interface BackfillProgress {
  running: boolean;
  finished: boolean;
  last_id: number;            // resume cursor
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  tmdb_verified: number;
  duplicates_prevented: number;
  started_at: string | null;
  updated_at: string | null;
  lock_until: string | null;
  last_error: string | null;
  last_title: string | null;
}

const KEY = "metadata_backfill_progress";
const LOCK_MS = 2 * 60 * 1000;

const EMPTY: BackfillProgress = {
  running: false, finished: false, last_id: 0, total: 0, processed: 0,
  updated: 0, skipped: 0, failed: 0, tmdb_verified: 0, duplicates_prevented: 0,
  started_at: null, updated_at: null, lock_until: null,
  last_error: null, last_title: null,
};

async function readProgress(): Promise<BackfillProgress> {
  const { data } = await supabaseAdmin
    .from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  return { ...EMPTY, ...((data?.value as any) || {}) };
}

async function writeProgress(p: Partial<BackfillProgress>): Promise<BackfillProgress> {
  const next = { ...(await readProgress()), ...p, updated_at: new Date().toISOString() };
  await supabaseAdmin.from("bot_settings").upsert(
    { key: KEY, value: next as any, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  return next;
}

async function counts(): Promise<{ total: number; remaining: number }> {
  const [{ count: total }, { count: remaining }] = await Promise.all([
    supabaseAdmin.from("movies").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("movies").select("*", { count: "exact", head: true })
      .lt("metadata_version", METADATA_VERSION),
  ]);
  return { total: total ?? 0, remaining: remaining ?? 0 };
}

export async function getBackfillProgress(): Promise<BackfillProgress & { remaining: number }> {
  const [p, c] = await Promise.all([readProgress(), counts()]);
  return { ...p, total: c.total, remaining: c.remaining };
}

export async function startBackfill(opts: { reset?: boolean } = {}) {
  const c = await counts();
  const prior = await readProgress();
  return await writeProgress({
    running: true,
    finished: false,
    total: c.total,
    last_id: opts.reset ? 0 : prior.last_id,
    processed: opts.reset ? 0 : prior.processed,
    updated: opts.reset ? 0 : prior.updated,
    skipped: opts.reset ? 0 : prior.skipped,
    failed: opts.reset ? 0 : prior.failed,
    tmdb_verified: opts.reset ? 0 : prior.tmdb_verified,
    duplicates_prevented: opts.reset ? 0 : prior.duplicates_prevented,
    started_at: opts.reset || !prior.started_at ? new Date().toISOString() : prior.started_at,
    lock_until: null,
    last_error: null,
  });
}

export async function stopBackfill() {
  return await writeProgress({ running: false, lock_until: null });
}

/** Process one bounded batch. Safe to call repeatedly (cron or admin UI). */
export async function runBackfillBatch(batch = 25): Promise<BackfillProgress & { remaining: number }> {
  let p = await readProgress();
  if (!p.running) return await getBackfillProgress();

  // single-flight lease so cron + UI never run in parallel
  const now = Date.now();
  if (p.lock_until && new Date(p.lock_until).getTime() > now) {
    return await getBackfillProgress();
  }
  p = await writeProgress({ lock_until: new Date(now + LOCK_MS).toISOString() });

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("movies")
      .select("*")
      .gt("id", p.last_id)
      .order("id", { ascending: true })
      .limit(batch);

    if (error) {
      await writeProgress({ last_error: error.message, lock_until: null });
      return await getBackfillProgress();
    }

    if (!rows || rows.length === 0) {
      await writeProgress({ running: false, finished: true, lock_until: null });
      return await getBackfillProgress();
    }

    let { processed, updated, skipped, failed, tmdb_verified, duplicates_prevented, last_id } = p;
    let lastTitle = p.last_title;
    let lastError = p.last_error;

    for (const row of rows as any[]) {
      last_id = row.id;
      processed++;
      try {
        const rawSource: string =
          (row.raw_caption && String(row.raw_caption)) ||
          [row.title, row.original_title].filter(Boolean).join(" ");

        const meta = parseSmart(rawSource);
        const title = meta.title && meta.title.length >= 2 ? meta.title : String(row.title || "").trim();

        if (!title) { skipped++; continue; }

        // TMDB verification — never destructive: on failure keep parsed values.
        let verified: Awaited<ReturnType<typeof tmdbVerify>> = null;
        try {
          verified = await tmdbVerify(title, meta.year ?? row.year ?? null);
        } catch { /* keep parsed metadata */ }

        const finalTitle = verified?.title || title;
        const finalYear = meta.year ?? verified?.year ?? row.year ?? null;
        const language = meta.language ?? row.language ?? verified?.language ?? null;
        const quality = meta.quality ?? row.quality ?? qualityFromSize(row.file_size) ?? null;
        const kind: string =
          meta.kind === "series" ? "series" :
          verified?.media_type === "TV" ? "series" : "movie";

        // Duplicate awareness — we always UPDATE in place, never insert.
        const { count: dupes } = await supabaseAdmin
          .from("movies")
          .select("*", { count: "exact", head: true })
          .neq("id", row.id)
          .eq("title", finalTitle)
          .eq("file_id", row.file_id);
        if ((dupes ?? 0) > 0) duplicates_prevented++;

        const aliases = generateAliases(finalTitle, verified?.original_title || row.original_title || null);
        const search_text = buildSearchText({
          title: finalTitle,
          original_title: verified?.original_title || row.original_title || null,
          overview: verified?.overview || row.overview || null,
          genres: verified?.genres || row.genres || null,
          aliases,
        } as any);

        const clean_caption = buildUserCaption({
          title: finalTitle,
          year: finalYear,
          language,
          quality,
          content_kind: kind,
          season: meta.season,
          episode_start: meta.episode_start,
          episode_end: meta.episode_end,
          is_combined: meta.combined,
          file_size: row.file_size,
        });

        const patch: any = {
          title: finalTitle,
          year: finalYear,
          language,
          quality,
          content_kind: kind,
          season: meta.season,
          episode_start: meta.episode_start,
          episode_end: meta.episode_end,
          is_combined: meta.combined,
          clean_caption,
          raw_caption: row.raw_caption ?? rawSource.slice(0, 2000),
          aliases,
          search_text,
          metadata_version: METADATA_VERSION,
        };

        if (verified) {
          tmdb_verified++;
          Object.assign(patch, {
            tmdb_id: verified.tmdb_id,
            imdb_id: verified.imdb_id,
            original_title: verified.original_title,
            poster_url: verified.poster_url ?? row.poster_url,
            backdrop_url: verified.backdrop_url ?? row.backdrop_url,
            overview: verified.overview || row.overview,
            genres: verified.genres || row.genres,
            runtime: verified.runtime ?? row.runtime,
            media_type: verified.media_type,
            tmdb_verified: true,
          });
        }

        const { error: upErr } = await supabaseAdmin.from("movies").update(patch).eq("id", row.id);
        if (upErr) { failed++; lastError = `id ${row.id}: ${upErr.message}`; continue; }

        updated++;
        lastTitle = finalTitle;
      } catch (e) {
        failed++;
        lastError = `id ${row.id}: ${(e as Error).message}`.slice(0, 300);
      }
      // gentle pacing for TMDB rate limits
      await new Promise((r) => setTimeout(r, 120));
    }

    const done = rows.length < batch;
    await writeProgress({
      last_id, processed, updated, skipped, failed, tmdb_verified, duplicates_prevented,
      last_title: lastTitle, last_error: lastError,
      running: done ? false : true,
      finished: done,
      lock_until: null,
    });
  } catch (e) {
    await writeProgress({ last_error: (e as Error).message.slice(0, 300), lock_until: null });
  }

  return await getBackfillProgress();
}
