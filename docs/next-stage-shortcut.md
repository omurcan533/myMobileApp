# Next-stage result shortcut

Question and minigame results expose a small fixed Next button for the host when the existing footer button is outside the scroll viewport. The footer remains in place; the shortcut hides once that button is fully visible and returns when it scrolls away.

The shortcut uses the same handler, cooldown and busy state as the footer. It is absent during active play, for guests, while paused and after a Pong rematch is approved. Pong's existing server result delay is reflected in both buttons. A per-result request guard prevents duplicate advancement while a request is pending or the UI is waiting for fresh room data. Failed requests and non-advancing responses can be retried.

Validation used actual screen components with local fixtures and mocked advancement responses:

- Question, math, Survivor and Pong result visibility; scrolling down and back up.
- Guest, pause, live-game and approved-rematch exclusion.
- Cooldown disables both paths; no request is sent by a disabled shortcut.
- Rapid second tap and stale-result protection; retry after errors and non-advancing responses.
- 320 x 568 and 390 x 650 viewports, plus resizing to fit the entire footer.
- TypeScript and production web export passed. Repository lint still reports 19 existing errors and 17 warnings.

Native devices and physical iPhone Safari were not tested. No database functions or game physics were changed.
