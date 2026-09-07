# Group search par har baar naye celebration emojis

User ki har group search ke results ke saath excitement/celebration wale emoji random niklen — har search par alag, fresh feel. Koi error na aaye.

## Changes — sab `src/lib/telegram/bot.server.ts` me

1. **Emoji pool + helper add** (`buildResultsMessage` ke paas):
   ```ts
   const CELEBRATION_EMOJIS = ["🎉","🥳","🎊","✨","🤩","🔥","💥","🎈","🚀","😍","🍿","🎁","🌟","💃","🕺","👏"];
   const randomEmojis = (n = 3) => [...CELEBRATION_EMOJIS].sort(() => Math.random() - 0.5).slice(0, n).join("");
   ```

2. **`buildResultsMessage` (~line 222)**: naya optional param `emoji?: string`. Header text:
   - `👋 *Hey,* ${emoji}` — search results line me celebration emoji add.
   - Default `emoji = randomEmojis()` agar pass na ho.

3. **`renderSearchResults` (~line 244)**: har call par `const emoji = randomEmojis()` pick karke `buildResultsMessage` me pass. Pagination edit (`editKey` wala path) par bhi naya random pick — taaki page flip par bhi fresh emojis dikhein.

4. **Error safety**: `tempReply` pehle se hi try/catch me hai aur `editMessageText` ka fallback `ctx.reply` hai — emoji change ke karan koi naya error path nahi banega. Sirf text me emoji string concatenate ho rahi hai, parse_mode Markdown se compatible.

## Scope se bahar (unchanged)

- DM/private search, daily digest, delivery captions — sab waise hi.
- Koi DB change nahi, koi naya package nahi.

## Verify

- `bunx tsgo --noEmit` clean.
- Group me do-teen baar alag movie search — har baar results ke saath alag celebration emojis dikhein, koi error nahi.
