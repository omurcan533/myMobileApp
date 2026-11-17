import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createGameServer } from '../game-server/main.mjs';
import { advancePong, controlSlot } from '../game-server/pong.mjs';

const id = '6fdd0f16-60de-4b5c-a5bb-fe851e2f42f2';
const state = (overrides = {}) => ({
  x: 0.5, y: 0.5, ay: 0.5, by: 0.5, vx: 0.46, vy: 0, scoreA: 0, scoreB: 0,
  a1: 'alice', a2: 'ally', b1: 'bob', b2: 'bob', modeA: 'duo', modeB: 'solo',
  tick: new Date().toISOString(), ...overrides,
});

test('Pong assigns solo and duo directions, tracks saves and settles a goal before the next serve', () => {
  const frame = state({ x: 0.93, controllerB: 'bob' });
  assert.equal(controlSlot(frame, 'watcher', 1), null);
  assert.equal(controlSlot(frame, 'alice', 1), null);
  assert.deepEqual(controlSlot(frame, 'bob', -1), { side: 'B', flag: 'holdBUp' });
  assert.deepEqual(controlSlot(frame, 'bob', 1), { side: 'B', flag: 'holdBDown' });
  advancePong(frame, 1 / 60, Date.now());
  assert.ok(frame.vx < 0);
  assert.equal(frame.savesB, 1);
  frame.x = 0.001;
  frame.scoreB = 4;
  advancePong(frame, 1 / 60, Date.now());
  assert.equal(frame.scoreB, 5);
  assert.equal(frame.x, 0.5);
  assert.deepEqual(frame.goalsByPlayer, { bob: 1 });
  advancePong(frame, 1 / 60, Date.now());
  assert.equal(frame.x, 0.5);
});

test('two players and a spectator receive authoritative WebSocket frames and only owners can move a paddle', { timeout: 9000 }, async () => {
  const finishes = [];
  let endsAt = Date.now() + 4300;
  const server = createGameServer({
    async player(match, token) {
      assert.equal(match, id);
      if (!['alice', 'bob', 'watcher'].includes(token)) throw Error('Denied');
      return token;
    },
    async sync(match, _owner, packet) {
      assert.equal(match, id);
      if (Date.now() >= endsAt && packet) {
        finishes.push(packet);
        return { status: 'done', state: packet };
      }
      return {
        status: 'live', state: packet ?? state(), paused: false,
        startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(endsAt).toISOString(),
      };
    },
  });
  const connections = [];
  await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const { port } = server.server.address();
  const connect = async token => {
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/pong');
    connections.push(socket);
    const messages = [];
    socket.addEventListener('message', event => messages.push(JSON.parse(event.data)));
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'join', match: id, token }));
    return { socket, messages, latest: () => messages.at(-1)?.state };
  };
  const check = async (predicate, timeout = 2000) => {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) {
      if (predicate()) return;
      await delay(15);
    }
    assert.fail('Expected WebSocket frame did not arrive');
  };
  const hold = (client, direction, pressed) => client.socket.send(JSON.stringify({ type: 'hold', direction, pressed }));
  try {
    const intruder = await connect('intruder');
    assert.equal((await once(intruder.socket, 'close'))[0].code, 4003);
    const [alice, bob, watcher] = await Promise.all(['alice', 'bob', 'watcher'].map(connect));
    await check(() => watcher.latest() && alice.latest() && bob.latest());
    const sent = Date.now();
    alice.socket.send(JSON.stringify({ type: 'ping', id: 123 }));
    await check(() => alice.messages.some(message => message.type === 'pong'));
    const ping = alice.messages.find(message => message.type === 'pong');
    assert.equal(ping.id, 123);
    assert.ok(ping.serverTime >= sent && ping.serverTime <= Date.now());
    hold(watcher, -1, true);
    hold(alice, 1, true);
    await delay(100);
    assert.equal(watcher.latest().ay, 0.5);
    hold(alice, -1, true);
    await check(() => bob.latest().ay < 0.47);
    hold(alice, -1, false);
    await check(() => watcher.latest().holdAUp === false);
    const settledA = watcher.latest().ay;
    hold(bob, 1, true);
    await check(() => watcher.latest().by > 0.53);
    bob.socket.close();
    await check(() => watcher.latest().holdBDown === false);
    const settledB = watcher.latest().by;
    await delay(100);
    assert.equal(watcher.latest().ay, settledA);
    assert.equal(watcher.latest().by, settledB);
    const sharedFrame = watcher.latest();
    await check(() => alice.messages.some(message => message.state?.tick === sharedFrame.tick));
    assert.deepEqual(alice.messages.find(message => message.state?.tick === sharedFrame.tick).state, sharedFrame);
    endsAt = Date.now() + 200;
    await check(() => watcher.messages.some(message => message.type === 'finished'), 3500);
    assert.equal(finishes.length, 1);
  } finally {
    for (const socket of connections) socket.close();
    await server.close();
  }
});
