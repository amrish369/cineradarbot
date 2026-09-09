import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UNLOCK_ENDPOINT =
  process.env.UNLOCK_API_URL ||
  "https://gagnuotcajltmdybbmvy.supabase.co/functions/v1/unlock";

export interface UnlockCreate {
  token: string;
  url: string;
}

export interface UnlockStatus {
  found: boolean;
  verified: boolean;
  expired: boolean;
}

async function call(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(UNLOCK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[unlock] ${res.status}: ${text}`);
    throw new Error(`Unlock service error ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error("[unlock] bad JSON:", text.slice(0, 200));
    throw new Error("Unlock service returned invalid response");
  }
}

export async function createUnlock(
  movieSlug: string,
  chatId: number | string,
): Promise<UnlockCreate | null> {
  try {
    const json = await call({
      action: "create",
      movie_slug: String(movieSlug || "").slice(0, 120),
      chat_id: String(chatId),
    });
    if (!json?.token || !json?.url) return null;
    return { token: String(json.token), url: String(json.url) };
  } catch (e) {
    console.error("[unlock] create failed", (e as Error).message);
    return null;
  }
}

export async function unlockStatus(token: string): Promise<UnlockStatus | null> {
  try {
    const json = await call({ action: "status", token });
    return {
      found: !!json?.found,
      verified: !!json?.verified,
      expired: !!json?.expired,
    };
  } catch (e) {
    console.error("[unlock] status failed", (e as Error).message);
    return null;
  }
}

// ── token → movie mapping (payload_store) ──
export async function rememberUnlockToken(
  token: string,
  data: { movieId: number; userId: number },
): Promise<void> {
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("payload_store")
    .upsert({ key: `unlock:${token}`, data: data as any, expires_at }, { onConflict: "key" });
}

export async function readUnlockToken(
  token: string,
): Promise<{ movieId: number; userId: number } | null> {
  const { data } = await supabaseAdmin
    .from("payload_store")
    .select("data")
    .eq("key", `unlock:${token}`)
    .maybeSingle();
  return (data?.data as any) ?? null;
}

// ── daily verification cache (once per day per user) ──
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function isVerifiedToday(userId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("bot_settings")
    .select("value")
    .eq("key", `adverify_${userId}`)
    .maybeSingle();
  const val = (data?.value as any) ?? null;
  return !!val && val.date === today();
}

export async function markVerifiedToday(userId: number): Promise<void> {
  await supabaseAdmin
    .from("bot_settings")
    .upsert(
      {
        key: `adverify_${userId}`,
        value: { date: today() } as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
}

// ── verify analytics events ──
export type VerifyEvent = "gate_shown" | "send_tap" | "verified" | "download";

export async function logVerifyEvent(
  userId: number,
  event: VerifyEvent,
  movieId?: number | null,
): Promise<void> {
  try {
    await supabaseAdmin.from("verify_events").insert({
      user_id: userId,
      event,
      movie_id: movieId ?? null,
    } as any);
  } catch (e) {
    console.error("[verify_events] insert failed", (e as Error).message);
  }
}
