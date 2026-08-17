import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings } from "./settings.server";
import { indexChannelPost } from "./autoindex.server";
import { PRIMARY_ADMIN } from "./config.server";

/**
 * Full-history scanner for the storage channel.
 *
 * Telegram bots cannot read a channel's history directly, so each message id
 * is *forwarded* into the admin's private chat to obtain the full Message
 * object (file_id, caption, size, media type, message id). The temporary copy
 * in the admin chat is deleted right away — nothing in the storage channel is
 * ever deleted, edited or moved.
 */

export interface ScanProgress {
  running: boolean;
  next_id: number;
  max_id: number;          // 0 = auto-detect end via consecutive misses
  scanned: number;
  indexed: number;
  updated: number;
  skipped: number;
  failed: number;
  misses: number;          // consecutive empty message ids
  finished: boolean;
  started_at: string | null;
  last_error: string | null;
  last_title: string | null;
}

const KEY = "storage_scan_progress";
const MISS_LIMIT = 400; // consecutive empty ids => treat as end of channel

const EMPTY: ScanProgress = {
  running: false, next_id: 1, max_id: 0, scanned: 0, indexed: 0, updated: 0,
  skipped: 0, failed: 0, misses: 0, finished: false, started_at: null,
  last_error: null, last_title: null,
};

export async function getScanProgress(): Promise<ScanProgress> {
  const { data } = await supabaseAdmin
    .from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  const v = (data?.value as any) || {};
  return { ...EMPTY, ...v };
}

export async function setScanProgress(p: Partial<ScanProgress>): Promise<ScanProgress> {
  const next = { ...(await getScanProgress()), ...p };
  await supabaseAdmin.from("bot_settings").upsert(
    { key: KEY, value: next as any, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  return next;
}

export async function startScan(opts: { from?: number; to?: number } = {}) {
  return await setScanProgress({
    running: true,
    finished: false,
    next_id: Math.max(1, Number(opts.from ?? 1)),
    max_id: Number(opts.to ?? 0),
    scanned: 0, indexed: 0, updated: 0, skipped: 0, failed: 0, misses: 0,
    started_at: new Date().toISOString(),
    last_error: null, last_title: null,
  });
}

export async function stopScan() {
  return await setScanProgress({ running: false });
}

async function activeToken(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("bot_tokens").select("token").eq("is_active", true).eq("enabled", true).maybeSingle();
  const token = (data as any)?.token || process.env.BOT_TOKEN;
  if (!token) throw new Error("No bot token configured");
  return token as string;
}

async function tg(token: string, method: string, body: any): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

/**
 * Process one batch of message ids. Safe to call repeatedly (cron or admin UI)
 * until `finished` is true.
 */
export async function runScanBatch(batch = 40): Promise<ScanProgress> {
  let p = await getScanProgress();
  if (!p.running) return p;

  const s = await getSettings(true);
  const storageChat = Number(s.storage_channel_id);
  const scratchChat = PRIMARY_ADMIN();
  const token = await activeToken();

  let { next_id, scanned, indexed, updated, skipped, failed, misses } = p;

  for (let i = 0; i < batch; i++) {
    const live = await getScanProgress();
    if (!live.running) break;
    if (p.max_id && next_id > p.max_id) break;

    const fwd = await tg(token, "forwardMessage", {
      chat_id: scratchChat,
      from_chat_id: storageChat,
      message_id: next_id,
      disable_notification: true,
    });

    if (!fwd.ok) {
      const desc: string = fwd.description || "unknown";
      const retry = fwd.parameters?.retry_after;
      if (retry) {
        await new Promise((r) => setTimeout(r, Math.min(30, Number(retry)) * 1000));
        continue; // retry the same id
      }
      if (/message to forward not found|message_id_invalid|MESSAGE_ID_INVALID/i.test(desc)) {
        misses++; scanned++; next_id++;
        if (!p.max_id && misses >= MISS_LIMIT) {
          await setScanProgress({ next_id, scanned, misses, running: false, finished: true });
          return await getScanProgress();
        }
        continue;
      }
      failed++; scanned++; next_id++;
      await setScanProgress({ last_error: `id ${next_id - 1}: ${desc}`.slice(0, 300) });
      continue;
    }

    misses = 0;
    const copy = fwd.result;

    try {
      const r = await indexChannelPost(copy, false, {
        force: true,
        chatId: storageChat,
        messageId: next_id,
      });
      if (r.status === "inserted") { indexed++; }
      else if (r.status === "updated") { updated++; }
      else if (r.status === "error") { failed++; await setScanProgress({ last_error: `id ${next_id}: ${r.reason}` }); }
      else skipped++;
      if (r.title) await setScanProgress({ last_title: r.title });
    } catch (e) {
      failed++;
      await setScanProgress({ last_error: `id ${next_id}: ${(e as Error).message}`.slice(0, 300) });
    }

    // Remove the temporary copy from the admin chat (storage channel untouched)
    await tg(token, "deleteMessage", {
      chat_id: scratchChat,
      message_id: copy.message_id,
    }).catch(() => null);

    scanned++; next_id++;
    await new Promise((r) => setTimeout(r, 120));
  }

  const done = !!p.max_id && next_id > p.max_id;
  p = await setScanProgress({
    next_id, scanned, indexed, updated, skipped, failed, misses,
    running: done ? false : (await getScanProgress()).running,
    finished: done,
  });
  return p;
}
