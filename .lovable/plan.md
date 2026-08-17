# Activate the bot with all features (fresh setup)

Restore your uploaded Bot Responder Sync project into this workspace, build a brand-new backend from your migrations, and bring a new test bot live with the full feature set.

## What gets restored

All code from `bot-responder-sync-main.zip` (excluding git metadata and the old `.env`):

- Telegram engine: webhook handling, auto-indexing of channel/group files, duplicate detection, caption building, force-join membership checks, auto-delete queue, growth/invite campaigns, mood replies
- TMDB metadata sync: posters, language, quality detection, backfill job
- Admin dashboard routes: overview, movies, users, requests, bots, broadcast, storage, settings
- Public site: movie search page, movie detail page, download links
- Scheduled hook endpoints: cleanup payloads, delete queue runner, invite reminders, TMDB backfill
- MCP tool endpoints (search movies, recent movies, catalog stats)

## Backend (fresh)

- Enable Lovable Cloud on this project (database, auth, storage, secrets).
- Run all 13 migrations from `supabase/migrations` in order, so the schema — movies, users, settings, bots, requests, delete queue, growth campaigns, roles/RLS — matches your original exactly.
- Starts empty; content re-populates automatically as the bot indexes your channel.
- Verify tables, RLS policies and grants after the migrations apply.

## Bot setup (new test bot)

1. You paste the new bot token (from BotFather) and your TMDB API key in the secure secret form.
2. I set the bot config: admin Telegram ID, main channel, backup channel, bot username.
3. Register the Telegram webhook to this project's stable dev URL using the derived secret token the code already expects.
4. Verify with `getWebhookInfo` plus a live `/start` check that search, force-join, indexing and auto-delete respond.

Your old production bot stays untouched.

## Admin access

Sign-in page and the `_authenticated/admin.*` dashboard come with the code. After the backend is up I'll walk you through creating your admin account and granting it the admin role so the dashboard unlocks.

## Technical notes

- Copy via rsync excluding `.git` and `.env`; secrets go to the secret store, never into files.
- Webhook URL: `https://project--<project-id>-dev.lovable.app/api/public/telegram/webhook`.
- Secrets needed: `BOT_TOKEN`, `TMDB_API_KEY`, `ADMIN_ID`, `CHANNEL`, `BACKUP_CHANNEL`, `BOT_USERNAME` (Supabase URL/keys are injected by Cloud).
- Hook endpoints under `/api/public/hooks/*` need an external scheduler; I'll list the URLs after setup so you can point pg_cron or a scheduler at them.

## Open items I will confirm during setup

- Admin Telegram ID for the test bot (defaults to the one in your code: 5951923988)
- Channel and backup channel usernames for the test bot
