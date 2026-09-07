# Group me TMDB poster hatao — sirf text results

Copyright strikes TMDB poster photos ki wajah se group me aa rahi hain. Group chats me poster bhejna poori tarah band; sirf text-based movie information/result jayega. Private DM me poster waise hi rahega (wahan copyright issue nahi).

## Changes — sab `src/lib/telegram/bot.server.ts` me

1. **Helper add**: `const isGroupChat = (ctx) => ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";`

2. **`/new` command (~line 1036)**: `tempPhoto(ctx, m.Poster, ...)` ki jagah —
   - Group ho to `tempReply(ctx, caption, { parse_mode: "Markdown", reply_markup: kb })` (same caption + buttons, bina photo).
   - Private DM ho to poster wala behavior unchanged.

3. **`/upcoming` command (~line 1068)**: wahi same logic — group me text-only, DM me poster.

4. **Search results — "available" card (~line 1891)**: group me poster wala `tempPhoto` skip; caption text (`✅ Available — N version(s)`) seedha `tempReply` se bhejo, phir `renderSearchResults` waise hi. DM me unchanged.

5. **`showTMDBRequestButtons` (~line 1955)**: group me `fallbackPoster` wala `tempPhoto` branch skip karke seedha text-only `tempReply` (existingCaption content text me shamil). DM me poster wala flow unchanged.

6. **`tempPhoto` helper me safety guard**: agar chat group/supergroup hai to photo bhejne ke bajaye caption ko text message me convert karke bheje — taaki future me koi bhi naya code galti se group me poster na bhej de.

## Scope se bahar (unchanged)

- Private DM digest (`sendPhoto(userId, ...)` line 468), onboarding, delivery captions — sab DM side, waise hi.
- Database me `poster_url` store hota rahega — website (`/m/$id` pages) aur admin panel ke liye zaroori hai; sirf Telegram **group** delivery band ho rahi hai.
- Movie files, buttons, auto-delete, koi aur feature touch nahi.

## Verify

- `bunx tsgo --noEmit` clean.
- Group me `/new`, `/upcoming` aur movie search karke dekhein — sirf text aaye, koi photo nahi.
- DM me same commands — poster waise hi aaye.
