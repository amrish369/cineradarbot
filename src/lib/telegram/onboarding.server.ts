import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings, asHttpsLink } from "./settings.server";
import { getUserGateStatus, type GateStatus } from "./membership.server";
import { getInstagramGate } from "./instagram.server";

export type Step = "instagram" | "main" | "backup" | "channel" | "done";

interface StepView {
  step: Step;
  text: string;
  url: string | null;
  button: string;
}

/** Sequential order — sirf pehla incomplete step dikhta hai. */
const ORDER: Array<Exclude<Step, "done">> = ["instagram", "main", "backup", "channel"];

export function nextStep(st: GateStatus): Step {
  for (const s of ORDER) if (st.missing.includes(s as any)) return s;
  return "done";
}

export async function stepView(step: Step, index: number, total: number): Promise<StepView> {
  const s = await getSettings();
  const head = step === "done" ? "" : `*Step ${index}/${total}*\n\n`;
  
  if (step === "instagram") {
    const gate = await getInstagramGate();
    const username = gate.username || "our_profile";
    return {
      step,
      button: "📸 Instagram Follow Karein",
      url: `https://instagram.com/${username.replace(/^@/, "")}`,
      text: `${head}📸 *Instagram Follow Karo*\n\n🎯 Profile follow karke agla step unlock karo.\n\n_Next step ke liye follow confirm karenge._`,
    };
  }
  if (step === "main")
    return {
      step, button: "📢 Main Group Join Karein",
      url: asHttpsLink(s.main_group_link || s.force_join_link),
      text: `${head}📢 *Main Group join karein.*\n\nJoin karte hi agla step apne aap yahin aa jayega — koi verify button dabane ki zarurat nahi.`,
    };
  if (step === "backup")
    return {
      step, button: "🗂️ Backup Group Join Karein",
      url: asHttpsLink(s.backup_group_link),
      text: `${head}🗂️ *Backup Group join karein.*\n\nJoin hote hi agla step automatic aa jayega.`,
    };
  if (step === "channel")
    return {
      step, button: "📣 Channel Join Karein",
      url: asHttpsLink(s.force_join_link),
      text: `${head}📣 *Channel join karein.*\n\nJoin hote hi verification poora ho jayega.`,
    };
  return {
    step, button: "", url: null,
    text: `✅ *Verification Poora!*\n\n🎬 Ab movie ka naam likho — group me ya yahin DM me — turant reply milega.\n/help se sab commands dekho.`,
  };
}

function stepIndex(st: GateStatus, step: Step): { index: number; total: number } {
  const applicable = ORDER.filter((s) => st.missing.includes(s as any) || isDone(st, s));
  const total = applicable.length || 1;
  const i = applicable.indexOf(step as any);
  return { index: i < 0 ? total : i + 1, total };
}

function isDone(st: GateStatus, s: Exclude<Step, "done">) {
  if (s === "instagram") return st.instagram;
  if (s === "main") return st.main;
  if (s === "backup") return st.backup;
  if (s === "channel") return st.channel;
  return false;
}

const KEY = (uid: number) => `onb_${uid}`;

async function lastShown(uid: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("bot_settings").select("value").eq("key", KEY(uid)).maybeSingle();
  const v = (data as any)?.value;
  return typeof v === "string" ? v : null;
}

async function markShown(uid: number, step: Step) {
  await supabaseAdmin.from("bot_settings").upsert(
    { key: KEY(uid), value: step as any, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

interface SendOpts {
  /** dobara wahi step bhi bhejo (e.g. user ne bot me message kiya) */
  force?: boolean;
  fresh?: boolean;
}

/**
 * User ki saved progress padhkar sirf CURRENT (pehla incomplete) step DM karta hai.
 * Jo step complete ho chuka wo dobara kabhi nahi dikhta.
 */
export async function sendCurrentStep(
  api: any,
  uid: number,
  opts: SendOpts = {},
): Promise<Step> {
  const st = await getUserGateStatus(api, uid, { fresh: !!opts.fresh });
  const step = nextStep(st);

  const prev = await lastShown(uid);
  if (!opts.force && prev === step) return step;
  if (step === "done" && prev === "done") return step;

  const { index, total } = stepIndex(st, step);
  const view = await stepView(step, index, total);

  // Configure hi nahi hai to us step ko skip karo
  if (step !== "done" && !view.url) {
    await markShown(uid, step);
    return step;
  }

  const reply_markup = view.url
    ? { inline_keyboard: [[{ text: view.button, url: view.url }]] }
    : undefined;

  try {
    await api.sendMessage(uid, view.text, {
      parse_mode: "Markdown",
      reply_markup,
      keep_message: true,
    } as any);
    await markShown(uid, step);
  } catch (e) {
    console.error("[onboarding sendCurrentStep]", uid, (e as Error).message);
  }
  return step;
}

/** chat_member update ke baad progress aage badhi ho to agla step khud bhej do. */
export async function advanceAfterJoin(api: any, uid: number) {
  await sendCurrentStep(api, uid, { fresh: true });
}
