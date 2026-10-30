import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../lib/serverTime.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };

function clock(fetch) {
  const exports = {}, timers = new Set();
  let deviceNow = 1_000_000;
  vm.runInNewContext(source, {
    exports, require: () => ({ supabase: {} }), AbortController,
    Date: { now: () => deviceNow, parse: Date.parse },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.test', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
    fetch,
    setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  });
  return { ...exports, timers, setNow(value) { deviceNow = value; } };
}

test('resync corrects countdown clock after device time changes', async () => {
  const c = clock(async () => ({ ok: true, text: async () => 'ts=1005', headers: new Headers() }));
  await c.syncServerTime(); assert.equal(c.serverNow(), 1_005_000);
  c.setNow(1_120_000); assert.equal(c.serverNow(), 1_125_000);
  await c.syncServerTime(); assert.equal(c.serverNow(), 1_005_000);
  assert.equal(c.isTimeSynced(), true); assert.equal(c.timers.size, 0);
});

test('timeouts bound trace body and fallback HEAD requests; a later reconnect can retry', async () => {
  let healthy = true;
  const signals = [];
  const c = clock(async (_, options) => {
    signals.push(options.signal);
    if (healthy) return { ok: true, text: async () => 'ts=1005', headers: new Headers() };
    const hung = () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('offline')), { once: true }));
    // Trace headers arrive but its body stalls; fallback HEAD stalls before headers.
    if (options.method === 'HEAD') return hung();
    return { ok: true, text: hung, headers: new Headers() };
  });
  await c.syncServerTime(); healthy = false;
  const syncing = c.syncServerTime(); await flush();
  for (let i = 0; i < 4; i++) {
    assert.equal(c.timers.size, 1);
    [...c.timers][0](); await flush();
  }
  await syncing;
  assert.equal(signals.slice(1).every(signal => signal.aborted), true);
  assert.equal(c.getServerOffset(), 5000); assert.equal(c.timers.size, 0);
  healthy = true; c.setNow(1_020_000); await c.syncServerTime();
  assert.equal(c.serverNow(), 1_005_000);
});
