import { createFileRoute } from "@tanstack/react-router";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";
import { runScanBatch, getScanProgress } from "@/lib/telegram/scan.server";

async function handle(request: Request) {
  const unauth = verifyHookSecret(request);
  if (unauth) return unauth;
  const url = new URL(request.url);
  const batch = Math.min(120, Math.max(1, Number(url.searchParams.get("batch") || "40")));
  const before = await getScanProgress();
  const p = before.running ? await runScanBatch(batch) : before;
  return new Response(JSON.stringify(p), { headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/public/hooks/storage-scan")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
