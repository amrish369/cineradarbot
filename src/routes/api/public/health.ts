import { createFileRoute } from "@tanstack/react-router";

// Lightweight keep-alive / uptime check. Returns no sensitive data.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("bot_tokens")
            .select("id", { head: true, count: "exact" })
            .limit(1);
          if (error) throw error;
          return Response.json({ ok: true, db: "up", ms: Date.now() - started });
        } catch {
          return Response.json({ ok: false, db: "down", ms: Date.now() - started }, { status: 503 });
        }
      },
    },
  },
});
