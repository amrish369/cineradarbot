import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Instagram Follow Gate — Self-verification flow.
 * 
 * Since Meta's Instagram Graph API requires business account approval and is complex,
 * we use a self-verification approach:
 * 1. Generate random verification code
 * 2. User follows the profile and adds code to their bio
 * 3. User confirms in bot — we mark as verified
 * 4. If Meta API becomes available, we can upgrade to auto-verification
 */

export interface InstagramGate {
  enabled: boolean;
  username: string | null; // e.g. "cineradarai_official"
}

export interface VerificationRecord {
  user_id: number;
  username: string;
  verified_at: string;
  verification_code: string;
  verification_method: "self" | "meta_api";
  meta_verified: boolean;
}

/**
 * Get Instagram gate settings from bot_settings table
 */
export async function getInstagramGate(): Promise<InstagramGate> {
  const { data: enabled } = await supabaseAdmin
    .from("bot_settings")
    .select("value")
    .eq("key", "instagram_gate_enabled")
    .maybeSingle();
  
  const { data: username } = await supabaseAdmin
    .from("bot_settings")
    .select("value")
    .eq("key", "instagram_username")
    .maybeSingle();

  return {
    enabled: (enabled?.value as any) === true,
    username: (username?.value as any) || null,
  };
}

/**
 * Enable/disable Instagram gate
 */
export async function setInstagramGateEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("bot_settings")
    .upsert(
      { key: "instagram_gate_enabled", value: enabled as any, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw error;
}

/**
 * Set Instagram username to follow
 */
export async function setInstagramUsername(username: string): Promise<void> {
  const clean = (username || "").trim();
  if (clean && !/^[a-zA-Z0-9_.]{1,30}$/.test(clean)) {
    throw new Error("Invalid Instagram username format");
  }
  const { error } = await supabaseAdmin
    .from("bot_settings")
    .upsert(
      { key: "instagram_username", value: clean || null, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw error;
}

/**
 * Generate a random 6-character alphanumeric code for bio verification
 */
export function generateVerificationCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create Instagram follow verification request
 */
export async function createInstagramVerification(userId: number, igUsername: string): Promise<VerificationRecord> {
  const code = generateVerificationCode();
  const { data, error } = await (supabaseAdmin as any)
    .from("instagram_follows")
    .upsert(
      {
        user_id: userId,
        username: igUsername,
        verification_code: code,
        verification_method: "self",
        meta_verified: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as VerificationRecord;
}

/**
 * Check if user has already verified Instagram follow
 */
export async function isInstagramFollowVerified(userId: number): Promise<boolean> {
  const { data } = await (supabaseAdmin as any)
    .from("instagram_follows")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Get verification code for a user (for UI display)
 */
export async function getVerificationCode(userId: number): Promise<string | null> {
  const { data } = await (supabaseAdmin as any)
    .from("instagram_follows")
    .select("verification_code")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.verification_code as string) || null;
}

/**
 * Manual verification (step 2: user confirms they've followed and added code to bio)
 */
export async function confirmInstagramVerification(userId: number): Promise<VerificationRecord> {
  const { data, error } = await (supabaseAdmin as any)
    .from("instagram_follows")
    .update({
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as VerificationRecord;
}

/**
 * Remove Instagram verification (admin can reset)
 */
export async function resetInstagramVerification(userId: number): Promise<void> {
  const { error } = await (supabaseAdmin as any)
    .from("instagram_follows")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}
