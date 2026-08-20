# Self-Hosting: Apna Supabase + Apna Cloudflare

Ye app TanStack Start (SSR) hai jo Cloudflare Workers par build hoti hai. Neeche ke steps follow karke poora bot + admin panel tumhare apne Supabase aur Cloudflare account par chalega — koi feature badalna nahi padta.

---

## 1. Requirements

- Node/Bun + `wrangler` (`bunx wrangler --version`)
- Apna Supabase project (URL, publishable/anon key, service role key, DB password)
- Apna Cloudflare account (Account ID + `wrangler login`)
- Bot secrets: `BOT_TOKEN`, `TMDB_API_KEY`, `ADMIN_ID`, `CHANNEL`, `BACKUP_CHANNEL`, `BOT_USERNAME`, `HOOK_SECRET`

---

## 2. Database setup (tumhara Supabase)

Saare migrations `supabase/migrations/` me hain. Apply karne ke 2 tareeke:

```bash
# Option A — Supabase CLI
supabase link --project-ref <TUMHARA_PROJECT_REF>
supabase db push
```

Option B — Supabase SQL Editor me har migration file ka SQL **date ke order me** paste karke run karo.

Ye schema banata hai: `movies`, `users`, `requests`, `bot_settings`, `bot_tokens`, `delete_queue`,
onboarding progress, backfill state — RLS policies aur GRANTs ke saath.

Purana data laana ho to sirf data copy karo (`movies`, `users`, `requests`, `bot_tokens`, `bot_settings`).
Telegram `file_id` / `message_id` waise ke waise rehte hain — Telegram par kuch delete/move nahi hota.

Extensions enable karo (cron ke liye):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

---

## 3. Environment variables

Local dev (`.env`):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

PUBLIC_APP_URL=https://<tumhara-domain>
BOT_TOKEN=...
TMDB_API_KEY=...
ADMIN_ID=5951923988
CHANNEL=@yourmaingroup
BACKUP_CHANNEL=@yourbackupgroup
BOT_USERNAME=yourbot
STORAGE_CHANNEL_ID=-100xxxxxxxxxx
HOOK_SECRET=<random long string>
```

> `PUBLIC_APP_URL` bahut important hai — webhook URL, shareable movie links aur cron targets
> isi se bante hain. Ye bina trailing slash ke tumhara live domain hona chahiye.

Production (Cloudflare Workers secrets):

```bash
for k in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY \
         PUBLIC_APP_URL BOT_TOKEN TMDB_API_KEY ADMIN_ID CHANNEL BACKUP_CHANNEL \
         BOT_USERNAME STORAGE_CHANNEL_ID HOOK_SECRET; do
  bunx wrangler secret put "$k"
done
```

`VITE_*` values build-time par inline hote hain, isliye build se pehle `.env` me hone chahiye.

---

## 4. Build & deploy

```bash
bun install
bun run build
bun run deploy      # = wrangler deploy
```

`wrangler.jsonc` me apna worker name / route / custom domain set kar lo:

```jsonc
{
  "name": "cineradar-bot",
  "main": "src/server.ts",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [{ "pattern": "yourdomain.com", "custom_domain": true }]
}
```

---

## 5. Telegram webhook

Deploy ke baad admin panel → **Bots** page se har bot ka "Set webhook" dabao (ye `PUBLIC_APP_URL` use karta hai),
ya manually:

```bash
curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d '{"url":"https://<domain>/api/public/telegram/webhook/<botId>",
       "secret_token":"<derived secret>",
       "allowed_updates":["message","edited_message","callback_query","chat_join_request","my_chat_member","chat_member"]}'
```

Sabse aasaan: `GET https://<domain>/api/public/telegram/register?secret=<HOOK_SECRET>` — ye legacy
single-bot webhook khud register kar deta hai aur `getWebhookInfo` bhi lauta deta hai.

---

## 6. Background jobs (pg_cron)

Supabase SQL editor me chalao (`<domain>` aur `<HOOK_SECRET>` replace karke):

```sql
select cron.schedule('run-delete-queue', '* * * * *', $$
  select net.http_get(url := 'https://<domain>/api/public/hooks/run-delete-queue',
    headers := '{"x-hook-secret":"<HOOK_SECRET>"}'::jsonb); $$);

select cron.schedule('storage-scan', '*/5 * * * *', $$
  select net.http_get(url := 'https://<domain>/api/public/hooks/storage-scan',
    headers := '{"x-hook-secret":"<HOOK_SECRET>"}'::jsonb); $$);

select cron.schedule('tmdb-backfill', '*/10 * * * *', $$
  select net.http_get(url := 'https://<domain>/api/public/hooks/tmdb-backfill',
    headers := '{"x-hook-secret":"<HOOK_SECRET>"}'::jsonb); $$);

select cron.schedule('metadata-backfill', '*/2 * * * *', $$
  select net.http_get(url := 'https://<domain>/api/public/hooks/metadata-backfill?run=1',
    headers := '{"x-hook-secret":"<HOOK_SECRET>"}'::jsonb); $$);

select cron.schedule('group-invite-reminders', '0 * * * *', $$
  select net.http_get(url := 'https://<domain>/api/public/hooks/group-invite-reminders',
    headers := '{"x-hook-secret":"<HOOK_SECRET>"}'::jsonb); $$);

select cron.schedule('cleanup-payloads', '0 3 * * *', $$
  select net.http_get(url := 'https://<domain>/api/public/hooks/cleanup-payloads',
    headers := '{"x-hook-secret":"<HOOK_SECRET>"}'::jsonb); $$);
```

Alternative: Cloudflare Cron Triggers — wahi URLs, wahi header.

---

## 7. Verification checklist

- [ ] `/`, `/movies`, `/m/<id>` load hote hain
- [ ] Admin login + Bots / Movies / Storage / Requests / Users / Settings / Broadcast pages
- [ ] `https://<domain>/api/public/hooks/metadata-backfill?status=1` → 200 JSON
- [ ] Bot `/start` → welcome message aata hai aur delete **nahi** hota
- [ ] Search → file delivery, force-join sequential auto-step
- [ ] Request fulfil hone par bheji gayi file permanent rehti hai
- [ ] Baaki messages auto-delete hote hain
- [ ] Storage scan naye uploads index karta hai
