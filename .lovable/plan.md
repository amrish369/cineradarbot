# Vercel Deployment Plan (sabhi features intact)

Haan, ye possible hai. App TanStack Start par hai, jo Vercel par chalti hai. Abhi build Cloudflare Workers ke liye configured hai, isliye kuch cheezein badalni hongi — lekin koi feature hataana nahi padega.

## Kya badlega

1. **Build target Cloudflare se Vercel**
   - `wrangler.jsonc` aur Cloudflare plugin ka use hata kar TanStack Start ka Vercel/Nitro preset use karenge.
   - `src/server.ts` wala custom SSR error wrapper as-is rakha jayega (sirf entry wiring adjust hogi).

2. **Runtime compatibility check**
   - `node:crypto` (`timingSafeEqual`), Buffer aur grammy webhook handler — ye sab Vercel Node runtime par theek chalte hain, Cloudflare se zyada permissive hai. Koi feature toota nahi.
   - Har server route/function ka env read `process.env` se hi hai, isliye Vercel par bina badlaav kaam karega.

3. **Environment variables Vercel par set karna**
   `BOT_TOKEN`, `TMDB_API_KEY`, `ADMIN_ID`, `CHANNEL`, `BACKUP_CHANNEL`, `BOT_USERNAME`, `HOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, aur client-side `VITE_SUPABASE_*`.
   (Service role key Lovable Cloud se directly nahi milti — is case me Vercel deployment ke liye backend ko apne Supabase project se chalana behtar hota hai; iske liye alag step batayenge.)

4. **Telegram webhook dobara register**
   - Admin panel ka `publicOrigin` Vercel domain par point karega.
   - Sabhi enabled bots ke webhook naye Vercel URL par `setWebhook` se re-register honge.

5. **Background jobs (cron)**
   - Abhi pg_cron Lovable URL hit karta hai. Migration ke baad wahi jobs Vercel domain hit karenge (auto-delete queue, storage-scan, tmdb-backfill, metadata-backfill, group-invite-reminders, cleanup-payloads).
   - Alternative: Vercel Cron use kar sakte hain — same endpoints, `HOOK_SECRET` header ke saath.

6. **Verification checklist deployment ke baad**
   - `/` aur `/movies` load, admin login, `/api/public/hooks/*?status=1` 200,
   - bot par `/start`, search, file delivery, force-join sequential flow, request fulfil, auto-delete + `keep_message` exceptions.

## Zaroori caveat

Lovable ka preview aur publish Cloudflare Workers par chalta hai. Agar hum is repo ko Vercel-only bana dete hain to Lovable ka apna preview/publish break ho sakta hai. Do options hain:

- **Option A — Dual target:** repo Lovable par bhi chale aur Vercel par bhi (Vercel ke liye alag build config/adapter). Thoda extra config, dono jagah kaam karta hai.
- **Option B — Vercel-only migration:** Cloudflare setup poora hata dete hain; Lovable preview/publish band, sirf Vercel par host.

## Technical details

- `vite.config.ts`: Lovable wrapper Cloudflare plugin build-only add karta hai; Vercel build ke liye `VERCEL` env par usko bypass/override karenge taaki Nitro Vercel preset output (`.vercel/output`) bane.
- `wrangler.jsonc` Option A me rahega, Option B me hatega.
- `package.json`: `build:vercel` script + `@cloudflare/vite-plugin` Option B me remove.
- Supabase client files auto-generated hain — inko chhua nahi jayega.
