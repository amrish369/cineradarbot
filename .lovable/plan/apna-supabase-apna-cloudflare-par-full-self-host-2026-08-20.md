# Apna Supabase + Apna Cloudflare par Full Self-Host

Agar tum apna Supabase project aur apna Cloudflare account dete ho, to ye **sabse aasaan aur sabse safe** raasta hai — Vercel se bhi behtar. Wajah: code already Cloudflare Workers ke liye build hota hai (`wrangler.jsonc` + Workers SSR entry), to koi runtime rewrite nahi karna padega. Sirf credentials aur URL badalte hain, koi feature nahi tootega.

## Tumhe kya dena hoga

1. **Supabase (apna project)**
   - Project URL
   - Publishable/anon key
   - Service role key
   - Database password (migrations push karne ke liye) ya SQL editor access

2. **Cloudflare**
   - Account ID
   - API token (Workers deploy permission ke saath)
   - Domain / workers.dev subdomain jahan host karna hai

3. **Bot secrets** (already hain, naye host par set karne honge)
   `BOT_TOKEN`, `TMDB_API_KEY`, `ADMIN_ID`, `CHANNEL`, `BACKUP_CHANNEL`, `BOT_USERNAME`, `HOOK_SECRET`

## Steps

### 1. Database migrate
- Project ke saare migrations (`supabase/migrations/`) tumhare Supabase par apply — poora schema: movies, users, requests, bot_settings, bot_tokens, delete queue, onboarding progress, backfill state, RLS + grants.
- Purana data chahiye to movies/users tables ka export → import (Telegram `file_id` / `message_id` waise ke waise, kuch delete nahi hota).

### 2. Code ko self-host config par le jaana
- `.env` / Worker secrets me tumhare Supabase URL + keys.
- `wrangler.jsonc` me tumhara worker name, account, aur `vars`/`secrets` binding.
- `src/lib/admin/admin.functions.ts` ka `publicOrigin` tumhare naye domain par point karega (abhi Lovable dev URL hardcoded hai).
- Baki code (grammy webhook, smart parser, backfill, onboarding flow, auto-delete + `keep_message` exceptions) bilkul same rahega.

### 3. Deploy
- `bun run build` → `wrangler deploy` (Workers).
- Static assets + SSR ek hi Worker se serve honge, jaise abhi hota hai.

### 4. Telegram webhook re-point
- Sabhi enabled bots ka `setWebhook` naye domain par: `https://<tumhara-domain>/api/public/telegram/webhook/<botId>`
- Secret token wahi derived secret (`webhookSecret`) rahega, admin panel se bhi set ho sakta hai.

### 5. Background jobs
- Tumhare Supabase me `pg_cron` + `pg_net` enable karke wahi 6 jobs naye domain par: run-delete-queue, storage-scan, tmdb-backfill, metadata-backfill, group-invite-reminders, cleanup-payloads (sab `HOOK_SECRET` se protected).
- Alternative: Cloudflare Cron Triggers — same endpoints hit karenge.

### 6. Verification checklist
- Site load (`/`, `/movies`, `/m/:id`), admin login + saare admin pages
- `/api/public/hooks/*?status=1` → 200
- Bot: `/start` welcome (delete na ho), search → file delivery, force-join sequential auto-step, request fulfil (message permanent), auto-delete baaki messages par
- Storage scan + metadata backfill dobara chalu

## Zaroori baatein

- **Lovable preview**: agar hum repo ko poori tarah tumhare Supabase par shift kar dete hain to Lovable ka built-in Cloud backend use nahi hoga; preview bhi tumhare Supabase se chalega. Ye theek hai, bas ek baar switch hoga.
- **Service role key** aur Cloudflare API token secrets hain — inhe chat me paste mat karna; main secrets tool ke through securely add karunga (Cloudflare token tumhe apne dashboard/CLI me use karna behtar hai).
- Koi bhi Telegram file delete/move nahi hogi — sirf DB records aur config move honge.

## Technical summary
- Runtime same: Cloudflare Workers + `nodejs_compat` (already `wrangler.jsonc` me set).
- Sirf env/secrets, `publicOrigin`, webhook URLs aur cron target URLs badalte hain.
- `@/integrations/supabase/*` generated files ki jagah self-host build me env-driven values use hongi (client already `VITE_SUPABASE_*` / `SUPABASE_*` env se padhta hai, to file edit ki zarurat nahi).
