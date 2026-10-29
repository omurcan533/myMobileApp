# Pong synchronization verification

The ball is rendered on a common server timeline, 200 ms behind the estimated
server clock. Position packets are interpolated; when packets stop, prediction
is limited to 100 ms and stops at a paddle plane until the server confirms a
hit or miss. This intentionally trades a small presentation delay for consistent
ball outcomes. It does not eliminate network latency or replace the database
simulation with a dedicated game server.

The local paddle reacts immediately and converges toward the latest server
position. Remote paddles follow the same buffered timeline as the ball. A new
match remounts the arena so timestamps and previous positions cannot leak across
matches. Old and duplicate physics ticks are discarded.

## Automated checks

On Node 24+: `node --test scripts/pong-timeline.test.mjs`

Also run `npx tsc --noEmit`, `npm run lint`, and `npm run build:web`.
The baseline repository currently has unrelated type and lint errors; compare
against the base commit rather than treating those failures as new regressions.

## Real match check before release

Use two separate sessions on two devices, then repeat with a third spectator.
Include solo/duo controls, simultaneous opposing controls, release, rapid taps,
wall-and-paddle hits, goal resets, pause/resume, and rematches. Repeat with one
client on a slower mobile connection. Background the host tab and check recovery.

Confirm that paddles converge after release, hits/misses agree on every device,
and a lost connection does not leave the ball simulating indefinitely. Compare
video recordings against the score and authoritative game state. Evaluate whether
the 200 ms presentation delay is acceptable; automated timeline tests do not
establish the experience on real devices.

For a diagnostic build set `EXPO_PUBLIC_PONG_DIAGNOSTICS=true` before building.
Each client logs aggregate `[Pong timing]` summaries approximately every 10 seconds
while measurements arrive. Capture `tickRoundTrip` on the host,
`controlRoundTrip` / `controlQueueWait` on players, and `broadcastSnapshotAge`
on recipients. Values are milliseconds; snapshot age depends on clock sync.
Logs remain in the local console and exclude room IDs, tokens, and player data.
The normal build leaves diagnostics off.

Database query statistics inspected during preparation showed mean execution
times of approximately 3.72 ms for tick calls (4,942 calls) and 4.97 ms for controls
(1,549 calls), with historical maxima of 761 ms and 1,092 ms respectively. These
are cumulative database timings, not current end-to-end latency measurements.

Remaining limitations: the host browser still drives database ticks, input still
travels through RPC, and slow or suspended hosts can stall physics until failover.
If measured latency or input fairness remains unacceptable, move authoritative
physics to a continuously running game service while retaining Supabase for
accounts, rooms, and persisted results.
