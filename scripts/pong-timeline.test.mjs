import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSnapshot, sampleTimeline, paddleTarget, stepLocalPaddle, controlAcknowledged } from '../lib/pongTimeline.ts';

const baseTime = Date.parse('2026-10-29T12:00:00Z');
const state = (ms, changes = {}) => ({ x: 0.5, y: 0.5, vx: 0.46, vy: 0.23, ay: 0.5, by: 0.5,
  scoreA: 0, scoreB: 0, tick: new Date(baseTime + ms).toISOString(), ...changes });
const history = (...states) => states.reduce(appendSnapshot, []);

test('goal serve stays at centre until serve time, including extrapolation and interpolation', () => {
  const serveAt=new Date(baseTime+600).toISOString();
  const centre=state(0,{serveAt});
  assert.equal(sampleTimeline(history(centre),baseTime+700).x,0.5);
  const moving=state(700,{serveAt,x:0.55,y:0.52});
  assert.equal(sampleTimeline(history(centre,moving),baseTime+700).x,0.5);
  assert.ok(sampleTimeline(history(centre,moving),baseTime+850).x>0.5);
  const held=state(0,{serveAt,holdADown:true,holdADownAt:new Date(baseTime).toISOString()});
  const sampled=sampleTimeline(history(held),baseTime+250);
  assert.equal(sampled.x,0.5);
  assert.ok(sampled.ay>0.5);
});

test('a short down tap ignores old release packets and waits for physics after the new release', () => {
  const idle={up:false,down:false};
  const fence={up:-Infinity,down:baseTime};
  const old=state(0,{holdADown:false,holdADownAt:new Date(baseTime).toISOString()});
  assert.equal(controlAcknowledged(old,'A',idle,[1],fence),false);
  const press=state(50,{holdADown:true,holdADownAt:new Date(baseTime+50).toISOString()});
  assert.equal(controlAcknowledged(press,'A',idle,[1],fence),false);
  const release=state(50,{holdADown:false,holdADownAt:new Date(baseTime+90).toISOString()});
  assert.equal(controlAcknowledged(release,'A',idle,[1],fence),false);
  const settled=state(100,{ay:0.536,holdADown:false,holdADownAt:new Date(baseTime+90).toISOString()});
  assert.equal(controlAcknowledged(settled,'A',idle,[1],fence),true);
  let position=0.536;
  for(const packet of [old,press,release]){
    position=stepLocalPaddle(position,1/60,false,false,packet.ay,controlAcknowledged(packet,'A',idle,[1],fence));
    assert.equal(position,0.536);
  }
  assert.equal(stepLocalPaddle(position,1/60,false,false,settled.ay,true),0.536);
});

test('held paddle moves at constant speed despite stale server positions at 60 and 120 FPS', () => {
  for (const fps of [60, 120]) {
    let position = 0.7;
    for (let i = 0; i < fps / 2; i++) {
      const previous = position;
      position = stepLocalPaddle(position, 1 / fps, true, false, 0.7, false);
      assert.ok(Math.abs(previous - position - 0.9 / fps) < 1e-9);
    }
    assert.ok(Math.abs(position - 0.25) < 1e-9);
  }
});
test('release waits for acknowledgement, then corrects without a position jump', () => {
  assert.equal(stepLocalPaddle(0.3, 1 / 60, false, false, 0.6, false), 0.3);
  assert.ok(Math.abs(stepLocalPaddle(0.3, 1 / 60, false, false, 0.6, true) - 0.31) < 1e-9);
  assert.equal(stepLocalPaddle(0.3, 1 / 60, true, true, 0.6, true), 0.3);
});
test('paddle reversal is immediate and long frames cannot escape the arena', () => {
  assert.ok(stepLocalPaddle(0.5, 1 / 60, false, true, 0.2, false) > 0.5);
  assert.equal(stepLocalPaddle(0.106, 5, true, false, 0.8, false), 0.105);
  assert.equal(stepLocalPaddle(0.894, 5, false, true, 0.2, false), 0.895);
});

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
