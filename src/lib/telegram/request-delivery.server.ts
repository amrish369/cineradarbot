import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { INSTAGRAM_URL } from "./config.server";

async function activeBotToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("bot_tokens").select("token").eq("is_active", true).eq("enabled", true).maybeSingle();
  if ((data as any)?.token) return (data as any).token as string;
  const { data: any1 } = await supabaseAdmin
    .from("bot_tokens").select("token").eq("enabled", true).limit(1).maybeSingle();
  if ((any1 as any)?.token) return (any1 as any).token as string;
  return process.env["BOT_TOKEN"] ?? null;
}

function cleanTitle(t: string): string {
  return t.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

async function findMovie(title: string, sinceIso?: string) {
  const q = cleanTitle(title);
  if (!q) return null;
  const pattern = `%${q.split(" ").join("%")}%`;
  let query = supabaseAdmin.from("movies").select("*")
    .or(`title.ilike.${pattern},search_text.ilike.${pattern.toLowerCase()}`)
    .order("id", { ascending: false }).limit(1);
  if (sinceIso) query = query.gte("created_at", sinceIso);
  const { data } = await query;
  return (data?.[0] as any) ?? null;
}

async function tg(token: string, method: string, body: any) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

/**
 * Send the requested movie file to the user who made the request.
 * waitMs: poll for the movie to appear (worker just forwarded it to storage).
 */
export async function deliverRequest(
  requestId: number,
  opts: { waitMs?: number } = {},
): Promise<{ delivered: boolean; reason?: string; movieId?: number }> {
  const { data: req } = await supabaseAdmin.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (!req) return { delivered: false, reason: "request not found" };
  const token = await activeBotToken();
  if (!token) return { delivered: false, reason: "no bot token" };

  const deadline = Date.now() + (opts.waitMs ?? 0);
  let movie = await findMovie(req.title);
  while (!movie && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    movie = await findMovie(req.title);
  }
  if (!movie) {
    console.warn("[deliverRequest] no movie match", requestId, req.title);
    return { delivered: false, reason: "movie not found in database" };
  }

  const caption =
    `🎉 *Aapki Requested Movie Ready Hai!*\n\n🎬 *${movie.title}*${movie.year ? ` (${movie.year})` : ""}\n` +
    `🌐 ${movie.language || "N/A"} | 📺 ${movie.quality || "N/A"}\n\n` +
    `📩 Aapne request kiya tha: _${req.title}_`;
  const reply_markup = { inline_keyboard: [[{ text: "📷 Instagram Par Follow Karein", url: INSTAGRAM_URL }]] };
  const chat_id = Number(req.user_id);

  try {
    if (movie.storage_chat_id && movie.storage_message_id) {
      try {
        await tg(token, "copyMessage", {
          chat_id, from_chat_id: movie.storage_chat_id, message_id: movie.storage_message_id,
          caption, parse_mode: "Markdown", reply_markup,
        });
        return { delivered: true, movieId: movie.id };
      } catch (e) {
        console.error("[deliverRequest] copy failed, fallback", (e as Error).message);
      }
    }
    const method = movie.file_kind === "document" ? "sendDocument" : "sendVideo";
    const field = movie.file_kind === "document" ? "document" : "video";
    await tg(token, method, { chat_id, [field]: movie.file_id, caption, parse_mode: "Markdown", reply_markup });
    return { delivered: true, movieId: movie.id };
  } catch (e) {
    console.error("[deliverRequest] send failed", requestId, (e as Error).message);
    return { delivered: false, reason: (e as Error).message };
  }
}
