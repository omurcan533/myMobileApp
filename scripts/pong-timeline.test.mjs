import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSnapshot, sampleTimeline, paddleTarget } from '../lib/pongTimeline.ts';

const baseTime = Date.parse('2026-10-29T12:00:00Z');
const state = (ms, changes = {}) => ({ x: 0.5, y: 0.5, vx: 0.46, vy: 0.23, ay: 0.5, by: 0.5,
  scoreA: 0, scoreB: 0, tick: new Date(baseTime + ms).toISOString(), ...changes });
const history = (...states) => states.reduce(appendSnapshot, []);

test('reordered, duplicate and malformed packets cannot rewind a timeline', () => {
  const frames = history(state(100), state(200));
  for (const packet of [state(50), state(200), state(300, { x: NaN }), state(300, { tick: 'bad' })]) {
    assert.equal(appendSnapshot(frames, packet), frames);
  }
});
test('two clients sample the same server positions despite different arrival times', () => {
  const packets = [state(0, { x: 0.3, ay: 0.2 }), state(125, { x: 0.4, ay: 0.3 }), state(250, { x: 0.5, ay: 0.4 })];
  const a = history(...packets), b = history(...packets.slice(0, 2));
  assert.deepEqual(sampleTimeline(a, baseTime + 300), sampleTimeline(b, baseTime + 300));
  assert.ok(Math.abs(sampleTimeline(a, baseTime + 300).ay - 0.28) < 1e-9);
});
test('a locally held paddle cannot change the authoritative ball hit', () => {
  const frames = history(state(0, { x: 0.07, vx: -0.46 }));
  const sampled = sampleTimeline(frames, baseTime + 280);
  assert.equal(sampled.x, 0.065);
  assert.equal(sampled.vx, -0.46);
  const hit = appendSnapshot(frames, state(125, { x: 0.1, vx: 0.48 }));
  assert.equal(sampleTimeline(hit, baseTime + 325).vx, 0.48);
});
test('lost connection freezes prediction after 100ms instead of inventing gameplay', () => {
  const frames = history(state(0));
  assert.deepEqual(sampleTimeline(frames, baseTime + 300), sampleTimeline(frames, baseTime + 5000));
});
test('goal reset is discrete and never interpolates across the court', () => {
  const before = state(0, { x: 1.01 }), after = state(125, { scoreA: 1 });
  const frames = history(before, after);
  assert.equal(sampleTimeline(frames, baseTime + 300), before);
  assert.equal(sampleTimeline(frames, baseTime + 325), after);
});
test('authoritative paddle positions and expired/released controls are respected', () => {
  const held = state(0, { ay: 0.6, holdAUp: true, holdAUpAt: new Date(baseTime).toISOString() });
  assert.ok(Math.abs(paddleTarget(held, 'A', baseTime + 100) - 0.51) < 1e-9);
  assert.equal(paddleTarget({ ...held, holdAUp: false }, 'A', baseTime + 100), 0.6);
  assert.equal(paddleTarget({ ...held, holdAUpAt: new Date(baseTime - 3000).toISOString() }, 'A', baseTime + 100), 0.6);
  assert.equal(paddleTarget(state(0, { ay: 0.8 }), 'A', baseTime + 100), 0.8);
});
test('timeline retains a bounded history and folds wall reflections', () => {
  const frames = history(...Array.from({ length: 100 }, (_, i) => state(i * 125)));
  assert.equal(frames.length, 32);
  const reflected = sampleTimeline(history(state(0, { y: 0.97, vy: 1 })), baseTime + 300);
  assert.ok(Math.abs(reflected.y - 0.88) < 1e-9);
});
