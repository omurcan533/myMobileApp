# Turkish and English support

UI language is a device preference. On first launch, Turkish device locales use Turkish and other locales use English. Profile → Language overrides this choice and saves it with AsyncStorage. Storage/locale-detection failures have a safe fallback. `useLanguage()` subscribes components, including memoized scoreboards, to changes.

`lib/copy.en.ts` contains authored English UI copy. `translate()` handles static authored labels and `format()` interpolates authored templates. Player nicknames, chat, personal answers, creature names and other player-entered content are never translated. Templates keep player text in separate values, so braces or Turkish words inside a nickname are preserved. Backend error codes stay stable and receive localized messages; unknown technical errors show a generic retry message.

## Shared puzzle language

A room has a separate `game_language` (`tr` or `en`). The creator's UI preference supplies the default through `create_room_localized`. The host can change it in the waiting room. After team assignment, the server locks this setting. The lobby and public-room cards display it.

Everyone in a room receives identical question IDs, scrambled letters, hints, answer masks, revealed letters and scoring rules. Joining with a different UI language does not change the room language. This avoids giving different word lengths or letter hints to players in different languages. An English UI in a Turkish room still shows Turkish puzzle content, as identified by the room-language setting. Players can switch that room to English before starting.

The English server pool includes:

- 48 anagrams with matching scrambled-letter sets and English hints.
- 24 riddles and 20 trivia questions, with accepted English answer variants.
- 24 social questions.
- 24 song-title questions with no lyrics. The song game remains disabled in the normal game-selection menu, as before; its English backend pool is ready.
- Localized numeric guessing prompts, including follow-up question history, so a multi-question sequence does not repeat a translated prompt.

Existing rooms and the legacy `create_room` RPC default to Turkish. The migration does not rewrite active rounds. Answer checking, letter purchases, score calculation and answer secrecy remain server-owned. Existing RLS is retained; English answers are not sent to clients before the normal reveal.

## Deployment and validation

Migration `20261103112518_english_game_content.sql` was applied to the connected myMobileApp Supabase project. Its filename matches the remote migration history. New room RPCs are granted only to authenticated sessions; shared-language changes require the host and an open lobby. Internal translation helpers do not expose question answers.

Run:

```sh
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test scripts/*.test.mjs
npm run build:web
```

The localization tests cover independent device preferences, persistence, player-text preservation, dictionary/template completeness, localized errors, shared puzzle language, English answer validation, language locking, Turkish backward compatibility, private answers, math follow-ups, song questions and idempotent seeds. The live two-client check also exercised room creation/joining, captain selection, the same English anagram on both clients, uppercase answer submission and room cleanup.

The English profile, home and waiting-room flows were inspected in a browser at 390 × 844. Physical iOS/Android installation and store test builds are separate release checks and have not been run.
