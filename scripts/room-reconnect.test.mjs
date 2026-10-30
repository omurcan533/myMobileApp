import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { coalescedTask } from '../lib/coalescedTask.ts';
import { currentRound, effNow, secondsLeft } from '../lib/selectors.ts';

const source = ts.transpileModule(readFileSync(new URL('../hooks/useRoom.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const snapshot = (idx = 0) => ({
  rooms: [{ id: 'room', phase: 'question', paused: false }],
  players: [{ id: 'me', user_id: 'user', team_side: idx ? 'B' : 'A', is_captain: !!idx }],
  room_teams: [{ side: 'A', score: idx * 10 }, { side: 'B', score: idx * 20 }],
  room_rounds: [{ id: `round-${idx}`, idx, status: 'open', closes_at: '2026-10-30T12:01:00Z' }],
  room_minigames: [{ id: `game-${idx}` }],
  minigame_entries: [{ id: `entry-${idx}`, minigame_id: `game-${idx}`, player_id: 'me' }],
});

// Execute the actual hook with deterministic React/native/network boundaries.
// No live backend or new test-only application dependencies are required.
function harness() {
  const states = [], refs = [], timers = new Map(), requests = [], cleanups = [];
  let stateIndex = 0, refIndex = 0, timerId = 0, subscribe, appState, syncs = 0;
  let db = snapshot(), mode = 'ok', holdTable = 'rooms';
  const react = {
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { cleanups.push(fn()); },
  };
  const channel = { on() { return this; }, subscribe(fn) { subscribe = fn; return this; } };
  const supabase = {
    channel: () => channel, removeChannel: async () => {},
    from(table) {
      const result = { data: structuredClone(db[table] ?? []), error: null };
      const requestMode = table === holdTable ? mode : 'ok';
      let signal;
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; }, in() { return this; },
        abortSignal(value) { signal = value; return this; },
        then(resolve, reject) {
          const pending = new Promise(done => {
            const entry = { table, signal, release: () => done(result) };
            requests.push(entry);
            if (requestMode === 'ok') done(result);
            else if (requestMode === 'error') done({ data: null, error: new Error('offline') });
            else if (requestMode === 'hang') {
              const abort = () => done({ data: null, error: new Error('aborted') });
              if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
            }
            // 'late' deliberately ignores abort to exercise stale-result guards.
          });
          return pending.then(resolve, reject);
        },
      };
      return query;
    },
  };
  const modules = {
    react, 'react-native': { AppState: { addEventListener(_, fn) { appState = fn; return { remove() {} }; } } },
    '../lib/supabase': { supabase }, '../lib/coalescedTask': { coalescedTask },
    '../lib/serverTime': { syncServerTime: async () => { syncs++; } },
  };
  const exports = {};
  const timer = (fn, ms, repeat = false) => { const id = ++timerId; timers.set(id, { fn, ms, repeat }); return id; };
  vm.runInNewContext(source, {
    exports, require(name) { assert.ok(name in modules, name); return modules[name]; }, AbortController,
    setTimeout: (fn, ms) => timer(fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timer(fn, ms, true), clearInterval: id => timers.delete(id),
    console: { warn() {} },
  });
  exports.useRoom('room');
  return {
    states, requests,
    get syncs() { return syncs; },
    set(next, nextMode = 'ok', table = 'rooms') { db = next; mode = nextMode; holdTable = table; },
    reconnect: () => subscribe('SUBSCRIBED'), resume: () => appState('active'),
    fire(ms) { for (const [id, item] of [...timers]) if (item.ms === ms) { if (!item.repeat) timers.delete(id); item.fn(); } },
    close() { cleanups.forEach(fn => fn?.()); },
  };
}

test('reconnect cancels a stuck fetch and restores current round, deadline, team, score and entries', async () => {
  const h = harness(); await flush();
  h.set(snapshot(), 'hang'); h.fire(6000); await flush();
  const stuck = h.requests.at(-10);
  h.set(snapshot(3)); h.reconnect(); await flush();
  assert.equal(stuck.signal.aborted, true);
  const data = h.states[0];
  assert.equal(currentRound(data.rounds).id, 'round-3');
  assert.equal(data.players[0].team_side, 'B');
  assert.equal(data.players[0].is_captain, true);
  assert.equal(data.teams[1].score, 60);
  assert.equal(data.entries[0].minigame_id, 'game-3');
  assert.equal(secondsLeft(currentRound(data.rounds).closes_at, Date.parse('2026-10-30T12:00:45Z')), 15);
  assert.equal(h.syncs, 1);
  assert.equal(h.states[1], null);
  h.close();
});

test('resume rejects a late obsolete snapshot and resynchronizes the clock', async () => {
  const h = harness(); await flush();
  const previous = h.states[0];
  h.set(snapshot(1), 'late'); h.fire(6000); await flush();
  const late = h.requests.findLast(r => r.table === 'rooms');
  h.set(snapshot(2)); h.resume();
  assert.equal(late.signal.aborted, true);
  assert.equal(h.states[0], previous);
  late.release(); await flush();
  assert.equal(currentRound(h.states[0].rounds).id, 'round-2');
  assert.equal(h.syncs, 1);
  h.close();
});

test('deadline also cancels the second-stage entries query and allows polling to recover', async () => {
  const h = harness(); await flush(); const previous = h.states[0];
  h.set(snapshot(1), 'hang', 'minigame_entries'); h.fire(6000); await flush();
  const entries = h.requests.at(-1);
  h.fire(10000); await flush();
  assert.equal(entries.signal.aborted, true);
  assert.equal(h.states[0], previous);
  assert.equal(h.states[1], null);
  h.set(snapshot(2)); h.fire(6000); await flush();
  assert.equal(currentRound(h.states[0].rounds).id, 'round-2');
  h.close();
});

test('transient errors preserve membership; teardown aborts requests and prevents late updates', async () => {
  const h = harness(); await flush(); const previous = h.states[0];
  h.set(snapshot(1), 'error'); h.fire(6000); await flush();
  assert.equal(h.states[0], previous); assert.equal(h.states[1], null);
  h.set(snapshot(2), 'late'); h.fire(6000); await flush();
  const late = h.requests.findLast(r => r.table === 'rooms');
  h.close(); assert.equal(late.signal.aborted, true);
  late.release(); await flush(); assert.equal(h.states[0], previous);
});

test('restored pause timestamp freezes countdown at the server pause time', () => {
  const room = { paused: true, paused_at: '2026-10-30T12:00:40Z' };
  const now = effNow(room, Date.parse('2026-10-30T12:10:00Z'));
  assert.equal(secondsLeft('2026-10-30T12:01:00Z', now), 20);
});
