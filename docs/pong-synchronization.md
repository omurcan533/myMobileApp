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

## Short tap regression

The server now settles the previous controls at each input transition before
changing the held flag. Sub-70 ms steps are no longer discarded, so a short tap
between host ticks is recorded. Physics samples its time after acquiring the
row lock, and input timestamps share that settled physics boundary. Existing
RPC signatures and execute grants are preserved.

The local renderer requires a newer control timestamp and a physics tick at or
after that timestamp before correcting a released paddle. An old `false` flag
cannot acknowledge a new press/release pair. Held motion remains local and
constant speed; idle corrections remain speed limited.

`scripts/pong-input-regression.sql` tests a 40 ms down tap, release stability,
an up tap, and outsider rejection against the real RPC functions. Fixtures and
temporary JWT configuration are rolled back inside a subtransaction. The test
ran both as an assertion during migration and again afterward. Eleven client
tests and the web build also pass; physical-device testing remains necessary.

If reverting the input-boundary server change is needed, the previous function
definitions are preserved in `docs/rollback-pong-input-transitions.sql`.

## Dedicated Node.js game server

The optional WebSocket engine in `game-server/` advances Pong at about 60
updates per second and sends authoritative frames at about 30 per second.
The client interpolates that stream with a 65 ms buffer and still predicts
local paddle motion. The database stores periodic checkpoints and the final
result. A short database lease prevents a second server, browser tick or timeout
resolver from competing for the same match. After disconnection the client
rejoins using its Supabase session, and held directions expire or are cleared
when the socket closes.

1. Apply the `dedicated_pong_server` Supabase migration.
2. Run `npm ci` and `npm start` from `game-server/` on a Node 22+ host. Set
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVER_KEY` in the
   host environment. The last key is a server-only Supabase secret or legacy
   service-role key. The process serves `GET /health` and upgrades `/pong`
   to WebSocket. It uses the host's `PORT` or defaults to 8080. Put it behind
   a TLS endpoint supporting WebSocket connections and start with one replica.
3. For a test client, set `EXPO_PUBLIC_PONG_SERVER_URL` to the full `wss://…/pong`
   endpoint and restart Metro or rebuild. For GitHub Pages the corresponding
   repository variable is `PONG_SERVER_URL`. For native builds set the Expo
   variable in that build environment. An empty variable keeps the original Pong
   engine. Keep both players and spectators on the configured build during rollout.
4. Test two physical devices and one spectator, including a backgrounded host,
   reconnects and a slower mobile network. Compare `gameServerRoundTrip` and
   `frameArrivalInterval` with the existing metrics. The 65 ms value is a render
   buffer. It does not measure phone-to-phone latency.

Run `npm ci --prefix game-server` and
`node --test scripts/pong-game-server.test.mjs scripts/pong-server-database.test.mjs`
for the WebSocket and database integration checks.
