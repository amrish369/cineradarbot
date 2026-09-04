import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings, normaliseChatRef } from "./settings.server";
import { getInstagramGate, isInstagramFollowVerified } from "./instagram.server";

const JOINED = new Set(["member", "administrator", "creator", "restricted"]);
const TTL_MS = 10 * 60 * 1000; // 10 min cache

export interface GateStatus {
  started: boolean;
  main: boolean;
  backup: boolean;
  channel: boolean;
  instagram: boolean;
  ok: boolean;
  /** Human labels of what is still missing: "start" | "main" | "backup" | "channel" | "instagram" */
  missing: Array<"start" | "main" | "backup" | "channel" | "instagram">;
}

interface TgApi {
  getChatMember: (chatId: string | number, userId: number) => Promise<{ status: string }>;
  sendChatAction: (chatId: number, action: any) => Promise<unknown>;
}

async function checkRef(api: TgApi, ref: string | null, userId: number): Promise<boolean> {
  const target = normaliseChatRef(ref || "");
  // No link configured, or a private invite link we cannot verify → don't block.
  if (!target || (!target.startsWith("@") && !/^-?\d+$/.test(target))) return true;
  try {
    const m = await api.getChatMember(target.startsWith("@") ? target : Number(target), userId);
    return JOINED.has(m.status);
  } catch (e) {
    // Bot not admin / chat unreachable → cannot verify, don't block the user.
    console.error("[membership check]", target, (e as Error).message);
    return true;
  }
}

/**
 * "started" is informational only — it never blocks the gate.
 * Group/channel members are treated as verified even if they never DM'd the bot;
 * delivery code falls back to a deep-link when a DM is not possible.
 */
async function hasStarted(_api: TgApi, userId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("tg_users").select("telegram_id").eq("telegram_id", userId).maybeSingle();
  return !!data;
}

async function checkInstagram(userId: number): Promise<boolean> {
  const gate = await getInstagramGate();
  if (!gate.enabled) return true; // Gate disabled → pass
  return await isInstagramFollowVerified(userId);
}

function fromRow(row: any): GateStatus {
  const started = !!row?.started;
  const main = !!row?.main_joined;
  const backup = !!row?.backup_joined;
  const channel = !!row?.channel_joined;
  const instagram = !!row?.instagram_verified;
  return build(started, main, backup, channel, instagram);
}

function build(started: boolean, main: boolean, backup: boolean, channel: boolean, instagram: boolean): GateStatus {
  const missing: GateStatus["missing"] = [];
  // NOTE: `started` intentionally does NOT block — only real group/channel
  // membership does. Existing group members pass without DM'ing the bot.
  if (!instagram) missing.push("instagram");
  if (!main) missing.push("main");
  if (!backup) missing.push("backup");
  if (!channel) missing.push("channel");
  return { started, main, backup, channel, instagram, ok: missing.length === 0, missing };
}

/**
 * Single source of truth: instagram (if enabled) + main group + backup group (+ force-join channel).
 * Live-checked against Telegram/Instagram and cached in group_membership for TTL_MS.
 */
export async function getUserGateStatus(
  api: TgApi,
  userId: number,
  opts: { fresh?: boolean } = {},
): Promise<GateStatus> {
  const { data: row } = await supabaseAdmin
    .from("group_membership")
    .select("telegram_id,started,main_joined,backup_joined,channel_joined,instagram_verified,last_checked")
    .eq("telegram_id", userId)
    .maybeSingle();

  if (!opts.fresh && row) {
    const age = Date.now() - new Date((row as any).last_checked ?? 0).getTime();
    const cached = fromRow(row);
    if (age < TTL_MS && cached.ok) return cached;
    if (age < TTL_MS && !opts.fresh && age < 60_000) return cached;
  }

  const s = await getSettings();
  const [started, main, backup, channel, instagram] = await Promise.all([
    hasStarted(api, userId),
    checkRef(api, s.main_group_link, userId),
    checkRef(api, s.backup_group_link, userId),
    checkRef(api, s.force_join_link, userId),
    checkInstagram(userId),
  ]);
  const status = build(started, main, backup, channel, instagram);

  await supabaseAdmin.from("group_membership").upsert(
    {
      telegram_id: userId,
      started,
      main_joined: main,
      backup_joined: backup,
      channel_joined: channel,
      instagram_verified: instagram,
      last_checked: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "telegram_id" },
  );

  return status;
}

const LABEL: Record<GateStatus["missing"][number], string> = {
  start: "Bot ko DM me Start karo",
  instagram: "Instagram follow karo",
  main: "Main group join karo",
  backup: "Backup group join karo",
  channel: "Channel join karo",
};

export function missingLabels(status: GateStatus): string[] {
  return status.missing.map((m) => LABEL[m]);
}
