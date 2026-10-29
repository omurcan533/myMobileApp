# Party gameplay improvements

- The open secret mission card closes when its body or header is pressed. Its
  completion and skip buttons keep their existing actions.
- Line Connect instructions describe freehand paths and intersections without
  incorrectly calling the board a 6×6 grid.
- Survivor no longer moves/scales the entire board or locks input for 1.1 s
  after each selection. Press-in starts a request; a synchronous ref prevents
  duplicate requests while awaiting its result. Feedback is visual and does not
  block the next row. Network round-trip time still limits accepted selections.
- On the first math briefing the host must pick 1, 3, or 5 questions. Each has a
  separate briefing, answer window, result, and normal +2 scoring. Follow-ups
  use a new minigame ID so entries and keypad state cannot carry over. A series
  avoids repeated prompts and stops at its configured length. Answers stay in
  the existing RLS-protected private answer table.
- Social Guess has 32 additional party questions, preferring unused prompts in
  the room until the available pool is exhausted.
- Tug of War uses the same A/red and B/blue colours as the rest of the app.
  The rope moves toward the leading team's side. A separate lead/final-result
  card names the team and exact force difference, including negative totals.
  Feedback colour follows the last submitted hit rather than the moving target.
- During building, only the captain can assign an architect from their own
  team, including themselves. Assignment resets that team's ready flag and clears
  stale architect votes. Voting outside the building phase is unchanged.

## Validation

`scripts/party-gameplay-regression.sql` exercises the live RPCs with fully
rolled-back fixtures: complete 1/3/5-question series, count validation, host-only
configuration, distinct prompts, private-answer handling and per-question
scoring; social question rotation; architect self/teammate selection, opponent
rejection, non-captain rejection and ready reset; and internal helper ACLs.

Run `npx tsc --noEmit`, `npm run lint`, and `npm run build:web`. Existing type and
lint errors remain elsewhere; the changed files introduce no new lint rule
failures. Device checks should include tapping all parts of the mission card,
rapid successive Survivor rows, choosing 1/3/5 on separate math games, captain
handover while building, and Tug leadership changes in both directions.

Pong logic and its stable renderer are untouched by this change.
