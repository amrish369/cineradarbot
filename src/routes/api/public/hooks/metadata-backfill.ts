import { createFileRoute } from "@tanstack/react-router";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";

async function handle(request: Request) {
  const unauth = verifyHookSecret(request);
  if (unauth) return unauth;
  const url = new URL(request.url);
  const batch = Math.min(50, Math.max(1, Number(url.searchParams.get("batch") || "25")));
  const { runBackfillBatch, getBackfillProgress, startBackfill, stopBackfill } =
    await import("@/lib/telegram/backfill.server");

  // Mirror the hook secret into settings (service-role only) so the scheduled
  // job can authenticate itself without the secret living in SQL files.
  if (url.searchParams.get("install") === "1") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bot_settings").upsert(
      { key: "hook_secret", value: process.env.HOOK_SECRET as any, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  }
  const action = url.searchParams.get("action") || (url.searchParams.get("status") ? "status" : "run");
  if (action === "start") await startBackfill({ reset: url.searchParams.get("reset") === "1" });
  if (action === "stop") await stopBackfill();
  const p = action === "status" || action === "stop"
    ? await getBackfillProgress()
    : await runBackfillBatch(batch);
  return new Response(JSON.stringify(p), { headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/public/hooks/metadata-backfill")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
