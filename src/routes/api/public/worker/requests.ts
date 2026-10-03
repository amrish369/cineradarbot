import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

// Bridge for the external Python userbot worker.
// GET  -> oldest pending request { request: { id, title } | null }
// POST -> { id, status: "fulfilled" | "failed" } updates that request.
function authorized(request: Request): boolean {
  const expected = process.env["WORKER_SECRET"];
  const got = request.headers.get("x-worker-secret") ?? "";
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["fulfilled", "failed"]),
});

export const Route = createFileRoute("/api/public/worker/requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("requests")
          .select("id, title")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ request: data ?? null });
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const update =
          parsed.status === "fulfilled"
            ? { status: "fulfilled", fulfilled_at: new Date().toISOString() }
            : { status: "failed" };
        const { error } = await supabaseAdmin.from("requests").update(update).eq("id", parsed.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
