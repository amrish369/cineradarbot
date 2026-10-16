// Bulk TMDB auto-match for unverified files. Only updates metadata columns;
// file_id / storage message fields are never touched.
import { cleanForMatch, tmdbSearchOptions, tmdbDetailById, type TMDBOption } from "./tmdb.server";

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();

/** Strip season/episode/year noise so "Mirzapur S01 Combined 2018" → "Mirzapur". */
export function autoMatchQuery(title: string): { query: string; year: number | null } {
  let t = cleanForMatch(title);
  const ym = t.match(/\b(19[3-9]\d|20[0-4]\d)\b/);
  const year = ym ? Number(ym[1]) : null;
  t = t.replace(/\bS\d{1,2}(\s?E\d{1,3}(\s?-?\s?\d{1,3})?)?\b.*$/i, " ")
    .replace(/\b(season|episode|ep|combined|complete|part)\b.*$/i, " ")
    .replace(/\b(19[3-9]\d|20[0-4]\d)\b.*$/, " ")
    .replace(/[-_.:|]+/g, " ").replace(/\s+/g, " ").trim();
  return { query: t, year };
}

/** Confident only when normalized titles are equal (or near-equal) and year agrees when known. */
export function isConfidentMatch(query: string, year: number | null, o: Pick<TMDBOption, "title" | "year">): boolean {
  const a = norm(query), b = norm(o.title);
  if (!a || !b) return false;
  const oy = o.year ? Number(o.year) : null;
  const yearOk = !year || !oy || Math.abs(year - oy) <= 1;
  if (!yearOk) return false;
  if (a === b) return true;
  // allow subtitle differences ("Jailer 2" vs "Jailer 2: ..."), but require strong overlap
  const at = a.split(" "), bt = b.split(" ");
  if (at.length >= 2 && (b.startsWith(a + " ") || a.startsWith(b + " ")) && Math.min(at.length, bt.length) / Math.max(at.length, bt.length) >= 0.5 && year && oy) return true;
  return false;
}

export async function autoMatchBatch(afterId: number, batch: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("movies")
    .select("id,title,year,content_kind")
    .or("tmdb_verified.is.null,tmdb_verified.eq.false")
    .gt("id", afterId).order("id", { ascending: true }).limit(batch);
  if (error) throw new Error(error.message);
  let matched = 0, skipped = 0, lastId = afterId;
  const samples: string[] = [];
  for (const r of rows ?? []) {
    lastId = r.id;
    try {
      const { query, year: y } = autoMatchQuery(r.title);
      const year = y ?? r.year ?? null;
      if (query.length < 2) { skipped++; continue; }
      const opts = await tmdbSearchOptions(query, 10);
      const prefer = r.content_kind === "series" ? "TV" : "Movie";
      const cands = opts.filter((o) => isConfidentMatch(query, year, o));
      const pick = cands.find((o) => o.kind === prefer) ?? cands[0];
      if (!pick) { skipped++; continue; }
      const det = await tmdbDetailById(pick.tmdbId, pick.kind);
      if (!det) { skipped++; continue; }
      const search_text = [det.title, det.original_title, det.year, r.title].filter(Boolean).join(" ").toLowerCase();
      const { error: ue } = await supabaseAdmin.from("movies")
        .update({ ...det, search_text, tmdb_verified: true } as any).eq("id", r.id);
      if (ue) { skipped++; continue; }
      matched++;
      if (samples.length < 3) samples.push(`${r.title} → ${det.title}${det.year ? ` (${det.year})` : ""}`);
    } catch { skipped++; }
  }
  const { count } = await supabaseAdmin.from("movies").select("id", { count: "exact", head: true })
    .or("tmdb_verified.is.null,tmdb_verified.eq.false").gt("id", lastId);
  return { processed: rows?.length ?? 0, matched, skipped, lastId, remaining: count ?? 0, samples };
}
