import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings } from "./settings.server";
import { qualityFromSize, humanSize } from "./caption.server";
import { parseSmart, buildUserCaption } from "./smart-parse.server";
import { METADATA_VERSION } from "./backfill.server";
import { tmdbVerify } from "./tmdb.server";
import { buildSearchText, generateAliases } from "./search.server";

export interface IndexResult {
  status: "skipped" | "inserted" | "updated" | "error";
  reason?: string;
  id?: number;
  title?: string;
  quality?: string | null;
  size?: string | null;
}

function extractFile(msg: any): { file_id: string; file_size: number | null; file_kind: "video" | "document"; file_name: string | null } | null {
  if (msg?.video) {
    return {
      file_id: msg.video.file_id,
      file_size: msg.video.file_size ?? null,
      file_kind: "video",
      file_name: msg.video.file_name ?? null,
    };
  }
  if (msg?.document) {
    return {
      file_id: msg.document.file_id,
      file_size: msg.document.file_size ?? null,
      file_kind: "document",
      file_name: msg.document.file_name ?? null,
    };
  }
  return null;
}

/**
 * Index (or refresh) one storage-channel post as a movie row.
 * Only runs for the configured storage channel and when auto-index is ON.
 */
export async function indexChannelPost(
  msg: any,
  isEdit = false,
  opts: { force?: boolean; chatId?: number; messageId?: number } = {},
): Promise<IndexResult> {
  const s = await getSettings();
  if (!s.auto_index && !opts.force) return { status: "skipped", reason: "auto-index off" };

  const chatId = Number(opts.chatId ?? msg?.chat?.id);
  if (!Number.isFinite(chatId) || chatId !== Number(s.storage_channel_id)) {
    return { status: "skipped", reason: "not storage channel" };
  }
  const messageId = Number(opts.messageId ?? msg?.message_id);

  const file = extractFile(msg);
  if (!file) return { status: "skipped", reason: "no video/document" };

  const rawText = (msg.caption || "").toString();

  // Our own archive posts carry a "db:<id>" marker. Re-parsing them would
  // overwrite the richer metadata we already saved (season / episode / etc),
  // so link the post to that row and leave the record untouched.
  const own = rawText.match(/db:\s*(\d+)/i);
  if (own) {
    const ownId = Number(own[1]);
    const { data: ownRow } = await supabaseAdmin
      .from("movies").select("id,title").eq("id", ownId).maybeSingle();
    if (ownRow) {
      await supabaseAdmin
        .from("movies")
        .update({ storage_chat_id: chatId, storage_message_id: messageId })
        .eq("id", ownId);
      return { status: "skipped", reason: "own archive post", id: ownId, title: (ownRow as any).title };
    }
  }

  const parsed = parseSmart(rawText, file.file_name);
  if (!parsed.title || parsed.title.length < 2) {
    return { status: "skipped", reason: "no usable title in caption/filename" };
  }

  const quality = parsed.quality || qualityFromSize(file.file_size);

  // Duplicate guards -------------------------------------------------
  const { data: byMessage } = await supabaseAdmin
    .from("movies").select("id")
    .eq("storage_chat_id", chatId)
    .eq("storage_message_id", messageId)
    .maybeSingle();

  if (!isEdit && !byMessage) {
    const { data: byFile } = await supabaseAdmin
      .from("movies").select("id").eq("file_id", file.file_id).maybeSingle();
    if (byFile) return { status: "skipped", reason: "file already indexed", id: (byFile as any).id };
  }

  // TMDB verification (best effort)
  let verified: Awaited<ReturnType<typeof tmdbVerify>> = null;
  try {
    verified = await tmdbVerify(parsed.title, parsed.year);
  } catch (e) {
    console.error("[autoindex] tmdbVerify", (e as Error).message);
  }

  const title = verified?.title || parsed.title;
  const year = parsed.year ?? verified?.year ?? null;
  const language = parsed.language ?? verified?.language ?? null;
  const contentKind = parsed.kind === "series" ? "series" : (verified?.media_type === "TV" ? "series" : "movie");
  const aliases = generateAliases(title, verified?.original_title || null);
  const search_text = buildSearchText({
    title,
    original_title: verified?.original_title || null,
    overview: verified?.overview || null,
    genres: verified?.genres || null,
    aliases,
  } as any);

  const row: any = {
    title,
    file_id: file.file_id,
    file_kind: file.file_kind,
    file_size: file.file_size,
    year,
    language,
    quality,
    storage_chat_id: chatId,
    storage_message_id: messageId,
    tmdb_id: verified?.tmdb_id ?? null,
    imdb_id: verified?.imdb_id ?? null,
    original_title: verified?.original_title ?? null,
    poster_url: verified?.poster_url ?? null,
    backdrop_url: verified?.backdrop_url ?? null,
    overview: verified?.overview ?? null,
    genres: verified?.genres ?? null,
    runtime: verified?.runtime ?? null,
    media_type: verified?.media_type ?? null,
    aliases,
    search_text,
    tmdb_verified: !!verified,
    auto_indexed: true,
    content_kind: contentKind,
    season: parsed.season,
    episode_start: parsed.episode_start,
    episode_end: parsed.episode_end,
    is_combined: parsed.combined,
    raw_caption: rawText ? rawText.slice(0, 2000) : (file.file_name ?? null),
    metadata_version: METADATA_VERSION,
    clean_caption: buildUserCaption({
      title, year, language, quality,
      content_kind: contentKind,
      season: parsed.season,
      episode_start: parsed.episode_start,
      episode_end: parsed.episode_end,
      is_combined: parsed.combined,
      file_size: file.file_size,
    }),
  };

  // Existing row for this exact post → update it.
  let targetId: number | null = (byMessage as any)?.id ?? null;

  if (targetId === null) {
    // Same title+year+quality already present → refresh instead of duplicating.
    // BUT: For series, also check season/episode so we don't overwrite different episodes
    let q = supabaseAdmin.from("movies").select("id").eq("title", title);
    q = year === null ? q.is("year", null) : q.eq("year", year);
    q = quality === null ? q.is("quality", null) : q.eq("quality", quality);
    
    // 🔧 FIX: Include series metadata in duplicate detection
    if (contentKind === "series") {
      q = parsed.season !== null ? q.eq("season", parsed.season) : q.is("season", null);
      q = parsed.episode_start !== null ? q.eq("episode_start", parsed.episode_start) : q.is("episode_start", null);
      q = parsed.episode_end !== null ? q.eq("episode_end", parsed.episode_end) : q.is("episode_end", null);
    }
    
    const { data: sameTitle } = await q.limit(1).maybeSingle();
    if (sameTitle) targetId = (sameTitle as any).id;
  }

  if (targetId !== null) {
    const { error } = await supabaseAdmin.from("movies").update(row).eq("id", targetId);
    if (error) return { status: "error", reason: error.message };
    return {
      status: "updated", id: targetId, title,
      quality: quality ?? null, size: humanSize(file.file_size),
    };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("movies").insert(row as any).select("id").single();
  if (error) return { status: "error", reason: error.message };

  return {
    status: "inserted",
    id: (inserted as any).id,
    title,
    quality: quality ?? null,
    size: humanSize(file.file_size),
  };
}

export async function recentAutoIndexed(limit = 20) {
  const { data } = await supabaseAdmin
    .from("movies")
    .select("id,title,year,language,quality,file_size,tmdb_verified,created_at")
    .eq("auto_indexed", true)
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []).map((m: any) => ({ ...m, size: humanSize(m.file_size) }));
}
