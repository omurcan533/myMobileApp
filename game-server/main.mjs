import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { advancePong, clearControls, controlSlot, STEP_MS } from './pong.mjs';

const CHECKPOINT_MS = 750;
const ACCESS_REFRESH_MS = 10_000;
const IDLE_MATCH_MS = 20_000;
const MAX_MATCHES = 128;
const MAX_CONNECTIONS = 512;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function supabasePongGateway({ url, publicKey, serverKey }) {
  async function rpc(name, args, apiKey, token) {
    const headers = { apikey: apiKey, 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(new URL('/rest/v1/rpc/' + name, url), {
      method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Supabase RPC ' + name + ' failed (' + response.status + ')');
    return response.json();
  }
  return {
    player: (id, token) => rpc('pong_socket_player', { p_match: id }, publicKey, token),
    sync: (id, owner, state = null) => rpc(
      'pong_server_sync', { p_match: id, p_owner: owner, p_state: state },
      serverKey, serverKey.startsWith('sb_secret_') ? undefined : serverKey,
    ),
  };
}

export function createGameServer(gateway) {
  const owner = randomUUID();
  const matches = new Map();
  const loading = new Map();
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  let closing = false;
  server.on('upgrade', (request, socket, head) => {
    if (closing || request.url !== '/pong' || sockets.clients.size >= MAX_CONNECTIONS) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client));
  });

  const send = (socket, message) => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 64 * 1024) return;
    socket.send(JSON.stringify(message));
  };
  const broadcast = (match, message) => {
    for (const client of match.clients) send(client, message);
  };
  function closeMatch(match, code) {
    matches.delete(match.id);
    for (const client of match.clients) client.close(code);
  }
  function stepTo(match, now) {
    const limit = Math.min(now, match.endsAt);
    if (match.paused || limit <= match.startsAt) {
      match.lastStep = now;
      return;
    }
    let time = Math.max(match.lastStep, match.startsAt, limit - 250);
    while (time < limit) {
      const next = Math.min(time + STEP_MS, limit);
      advancePong(match.state, (next - time) / 1000, next);
      time = next;
    }
    match.lastStep = limit;
  }
  function releaseClient(match, socket) {
    const now = Date.now();
    stepTo(match, now);
    for (const [flag, holder] of match.controls) {
      if (holder !== socket) continue;
      match.controls.delete(flag);
      match.state[flag] = false;
      match.state[flag + 'At'] = new Date(now).toISOString();
    }
    match.clients.delete(socket);
    if (!match.clients.size) match.idleSince = now;
  }
  function loadMatch(id) {
    if (matches.has(id)) return Promise.resolve(matches.get(id));
    if (loading.has(id)) return loading.get(id);
    if (matches.size + loading.size >= MAX_MATCHES) throw new Error('server_full');
    const pending = gateway.sync(id, owner).then(initial => {
      if (initial.status !== 'live') throw new Error('match_unavailable');
      const now = Date.now();
      const match = {
        id, state: initial.state, paused: initial.paused,
        startsAt: Date.parse(initial.startsAt), endsAt: Date.parse(initial.endsAt),
        lastStep: now, nextSync: now + CHECKPOINT_MS, lastSync: now,
        syncing: false, idleSince: now, clients: new Set(), controls: new Map(),
      };
      clearControls(match.state, now);
      matches.set(id, match);
      return match;
    }).finally(() => loading.delete(id));
    loading.set(id, pending);
    return pending;
  }

  sockets.on('connection', socket => {
    let match, player, token, authenticating = false;
    let budget = 80, windowEnds = Date.now() + 1000;
    let accessTimer;
    const authTimeout = setTimeout(() => socket.close(4001, 'Authentication timed out'), 7000);
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(authTimeout);
      clearInterval(accessTimer);
      if (match) releaseClient(match, socket);
    });
    socket.on('message', async (raw, binary) => {
      if (binary) return socket.close(1003);
      const now = Date.now();
      if (now >= windowEnds) { budget = 80; windowEnds = now + 1000; }
      if (--budget < 0) return socket.close(1008, 'Too many messages');
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return socket.close(1007); }
      if (!message || typeof message !== 'object') return socket.close(1007);

      if (!match) {
        if (authenticating || message.type !== 'join' || typeof message.match !== 'string' ||
          !UUID.test(message.match) || typeof message.token !== 'string' || !message.token || message.token.length > 6000) {
          return socket.close(4001);
        }
        authenticating = true;
        try {
          token = message.token;
          player = await gateway.player(message.match, token);
          if (socket.readyState !== WebSocket.OPEN) return;
          const loaded = await loadMatch(message.match);
          if (socket.readyState !== WebSocket.OPEN) return;
          match = loaded;
          match.clients.add(socket);
          match.idleSince = null;
          clearTimeout(authTimeout);
          send(socket, { type: 'frame', state: match.state, paused: match.paused });
          let validating = false;
          accessTimer = setInterval(async () => {
            if (validating) return;
            validating = true;
            try {
              if (await gateway.player(match.id, token) !== player) socket.close(4003);
            } catch {
              socket.close(4003);
            } finally { validating = false; }
          }, ACCESS_REFRESH_MS);
        } catch {
          socket.close(4003, 'Match unavailable');
        }
        return;
      }

      if (message.type === 'ping') {
        if (typeof message.id === 'number') send(socket, { type: 'pong', id: message.id, serverTime: Date.now() });
        return;
      }
      if (message.type !== 'hold' || typeof message.pressed !== 'boolean') return;
      const slot = controlSlot(match.state, player, message.direction);
      if (!slot || match.paused || now < match.startsAt || now >= match.endsAt) return;
      if (!message.pressed && match.controls.get(slot.flag) !== socket) return;
      stepTo(match, now);
      match.state[slot.flag] = message.pressed;
      match.state[slot.flag + 'At'] = new Date(now).toISOString();
      if (message.pressed) {
        match.state['controller' + slot.side] = player;
        match.controls.set(slot.flag, socket);
      } else match.controls.delete(slot.flag);
    });
  });

  async function checkpoint(match, now) {
    match.syncing = true;
    match.nextSync = now + CHECKPOINT_MS;
    try {
      const snapshot = { ...match.state, goalsByPlayer: { ...match.state.goalsByPlayer } };
      const result = await gateway.sync(match.id, owner, snapshot);
      if (result.status === 'done') {
        broadcast(match, { type: 'finished', state: result.state });
        closeMatch(match, 1000);
        return;
      }
      if (result.status !== 'live') {
        closeMatch(match, 1012);
        return;
      }
      if (result.paused !== match.paused) {
        match.state = result.state;
        match.lastStep = Date.now();
        match.controls.clear();
        clearControls(match.state, match.lastStep);
      }
      match.paused = result.paused;
      match.endsAt = Date.parse(result.endsAt);
      match.lastSync = now;
    } catch {
      // The lease must remain valid before this instance can send more frames.
      if (Date.now() - match.lastSync >= 5000) closeMatch(match, 1012);
    } finally { match.syncing = false; }
  }

  let frame = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    frame++;
    for (const match of matches.values()) {
      if ((match.idleSince !== null && now - match.idleSince >= IDLE_MATCH_MS) || now - match.lastSync >= 5500) {
        closeMatch(match, 1012);
        continue;
      }
      stepTo(match, now);
      if (frame % 2 === 0) broadcast(match, { type: 'frame', state: match.state, paused: match.paused });
      if (!match.syncing && (now >= match.nextSync ||
        (!match.paused && (now >= match.endsAt || Math.max(match.state.scoreA, match.state.scoreB) >= 5)))) {
        void checkpoint(match, now);
      }
    }
  }, STEP_MS);
  const pingTimer = setInterval(() => {
    for (const client of sockets.clients) {
      if (client.isAlive === false) client.terminate();
      else { client.isAlive = false; client.ping(); }
    }
  }, 15_000);
  sockets.on('connection', client => { client.on('pong', () => { client.isAlive = true; }); });

  return {
    server,
    async close() {
      closing = true;
      clearInterval(timer);
      clearInterval(pingTimer);
      for (const client of sockets.clients) client.terminate();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serverKey = process.env.SUPABASE_SERVER_KEY;
  if (!url || !publicKey || !serverKey) throw new Error('Missing Supabase configuration for the game server');
  const app = createGameServer(supabasePongGateway({ url, publicKey, serverKey }));
  process.once('SIGINT', () => { void app.close(); });
  process.once('SIGTERM', () => { void app.close(); });
  const port = Number(process.env.PORT ?? 8080);
  app.server.listen(port, '0.0.0.0', () => console.log('Pong game server listening on port ' + port));
}
