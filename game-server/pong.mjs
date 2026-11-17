const PADDLE_SPEED = 0.9;
const HOLD_TTL_MS = 2500;
export const STEP_MS = 1000 / 60;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const paddle = value => clamp(value, 0.105, 0.895);
const flags = ['holdAUp', 'holdADown', 'holdBUp', 'holdBDown'];

export function controlSlot(state, player, direction) {
  if (direction !== -1 && direction !== 1) return null;
  for (const side of ['A', 'B']) {
    const first = state[side.toLowerCase() + '1'];
    const second = state[side.toLowerCase() + '2'];
    const solo = state['mode' + side] === 'solo';
    if (solo ? player === first : player === (direction === -1 ? first : second)) {
      return { side, flag: 'hold' + side + (direction === -1 ? 'Up' : 'Down') };
    }
  }
  return null;
}

export function clearControls(state, now) {
  for (const flag of flags) {
    state[flag] = false;
    state[flag + 'At'] = new Date(now).toISOString();
  }
}

export function advancePong(state, dt, now) {
  if (dt <= 0 || Math.max(state.scoreA, state.scoreB) >= 5) return;
  const held = flag => state[flag] && now - Date.parse(state[flag + 'At']) < HOLD_TTL_MS;
  const direction = side => Number(!!held('hold' + side + 'Down')) - Number(!!held('hold' + side + 'Up'));
  const a = direction('A'), b = direction('B');
  const { x, y, vx, vy, ay, by } = state;
  state.ay = paddle(ay + a * dt * PADDLE_SPEED);
  state.by = paddle(by + b * dt * PADDLE_SPEED);

  const wall = value => value < 0.025 ? 0.05 - value : value > 0.975 ? 1.95 - value : value;
  let nextX = x + vx * dt;
  let nextY = y + vy * dt;
  const left = vx < 0;
  const plane = left ? 0.065 : 0.935;
  const crosses = left ? x > plane && nextX <= plane : vx > 0 && x < plane && nextX >= plane;
  if (crosses) {
    const hitTime = (plane - x) / vx;
    const unreflectedY = y + vy * hitTime;
    const hitY = wall(unreflectedY);
    const center = left ? paddle(ay + a * hitTime * PADDLE_SPEED) : paddle(by + b * hitTime * PADDLE_SPEED);
    if (Math.abs(hitY - center) <= 0.125) {
      const side = left ? 'A' : 'B';
      const speed = Math.min(1.8, Math.abs(vx) * 1.045);
      const incomingY = hitY === unreflectedY ? vy : -vy;
      state.vx = left ? speed : -speed;
      state.vy = clamp(incomingY + (hitY - center) * 0.3, -1.2, 1.2);
      nextX = plane + state.vx * (dt - hitTime);
      nextY = hitY + state.vy * (dt - hitTime);
      state['saves' + side] = (state['saves' + side] ?? 0) + 1;
      const controller = state['controller' + side];
      if (controller) state['lastTouch' + side] = controller;
    }
  }
  state.x = nextX;
  state.y = wall(nextY);
  if (nextY < 0.025 || nextY > 0.975) state.vy *= -1;

  if (nextX < 0 || nextX > 1) {
    const side = nextX < 0 ? 'B' : 'A';
    state['score' + side]++;
    const scorer = state['lastTouch' + side];
    if (scorer) {
      const goals = state.goalsByPlayer ??= {};
      goals[scorer] = (goals[scorer] ?? 0) + 1;
    }
    Object.assign(state, { x: 0.5, y: 0.5, vx: side === 'B' ? 0.46 : -0.46, vy: side === 'B' ? 0.23 : -0.23 });
  }
  state.tick = new Date(now).toISOString();
}
