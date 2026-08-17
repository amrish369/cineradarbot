# Activate the bot with all features

Restore your uploaded Bot Responder Sync project into this workspace, connect it to your existing database, and bring a new test bot live with the full feature set.

## What gets restored

All code from `bot-responder-sync-main.zip` (excluding git metadata and the old `.env`):

- Telegram engine: webhook handling, auto-indexing of channel/group files, duplicate detection, caption building, force-join membership checks, auto-delete queue, growth/invite campaigns, mood replies
- TMDB metadata sync: posters, language, quality detection, backfill job
- Admin dashboard routes: overview, movies, users, requests, bots, broadcast, storage, settings
- Public site: movie search page, movie detail page, download links
- Scheduled hook endpoints: cleanup payloads, delete queue runner, invite reminders, TMDB backfill
- MCP tool endpoints (search movies, recent movies, catalog stats)

## Backend

You want to keep your existing database with all indexed content. To do that I need three values from your old project, which I will request through the secure secret form:

- Database URL
- Publishable (anon) key
- Service role key

I will wire them into this project's server and browser config, and skip re-running migrations since the schema already exists there. Nothing in your data is modified.

## Bot setup (new test bot)

1. You paste the new bot token (from BotFather) and your TMDB API key in the secure form.
2. I set the bot config: admin Telegram ID, main channel, backup channel, bot username.
3. I register the Telegram webhook to this project's stable dev URL, using the derived secret token the code already expects.
4. Verify with `getWebhookInfo` and a live `/start` check that indexing, search, force-join, and auto-delete respond.

Your old production bot stays untouched.

## Technical notes

- Copy is done with rsync excluding `.git` and `.env`; secrets go to the secret store, never into files.
- Webhook URL: `https://project--<project-id>-dev.lovable.app/api/public/telegram/webhook`.
- Secrets needed: `BOT_TOKEN`, `TMDB_API_KEY`, `ADMIN_ID`, `CHANNEL`, `BACKUP_CHANNEL`, `BOT_USERNAME`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (plus the `VITE_` variants for the frontend).
- Cron-style hook endpoints under `/api/public/hooks/*` need an external scheduler; I will list the URLs after setup so you can point pg_cron or a scheduler at them.

## Open items I will confirm during setup

- Admin Telegram ID for the test bot (defaults to the one in your code: 5951923988)
- Channel/backup channel usernames for the test bot
