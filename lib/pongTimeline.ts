export type PongFrameState = {
  x: number; y: number; vx: number; vy: number; ay: number; by: number;
  scoreA: number; scoreB: number; tick?: string;
  holdAUp?: boolean; holdADown?: boolean; holdBUp?: boolean; holdBDown?: boolean;
  holdAUpAt?: string; holdADownAt?: string; holdBUpAt?: string; holdBDownAt?: string;
};
export type PongSnapshot = { at: number; state: PongFrameState };
export const PONG_RENDER_DELAY_MS = 200;
const MAX_EXTRAPOLATION_MS = 100;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function appendSnapshot(history: PongSnapshot[], state: PongFrameState): PongSnapshot[] {
  const at = Date.parse(state.tick ?? '');
  if (!Number.isFinite(at) || ![state.x, state.y, state.vx, state.vy, state.ay, state.by, state.scoreA, state.scoreB].every(Number.isFinite)) return history;
  if (history.length && at <= history[history.length - 1].at) return history;
  return [...history.slice(-31), { at, state }];
}

export function paddleTarget(state: PongFrameState, side: 'A' | 'B', now: number): number {
  const at = Date.parse(state.tick ?? '');
  const end = Math.min(now, at + MAX_EXTRAPOLATION_MS);
  let position = side === 'A' ? state.ay : state.by;
  for (const [direction, name] of [[-1, 'Up'], [1, 'Down']] as const) {
    const key = `hold${side}${name}` as 'holdAUp' | 'holdADown' | 'holdBUp' | 'holdBDown';
    const pressedAt = Date.parse(state[`${key}At`] ?? '');
    if (state[key] && Number.isFinite(pressedAt)) {
      const seconds = Math.max(0, Math.min(end, pressedAt + 2500) - Math.max(at, pressedAt)) / 1000;
      position += direction * 0.9 * seconds;
    }
  }
  return clamp(position, 0.105, 0.895);
}

// Every client samples the same server timeline. Never invent a paddle hit locally.
export function sampleTimeline(history: PongSnapshot[], now: number): PongFrameState | null {
  if (!history.length) return null;
  const target = now - PONG_RENDER_DELAY_MS;
  if (target <= history[0].at) return history[0].state;
  for (let i = 1; i < history.length; i++) {
    const before = history[i - 1], after = history[i];
    if (target > after.at) continue;
    if (target === after.at) return after.state;
    // Goals are discontinuities: don't draw the ball travelling back to centre.
    if (before.state.scoreA !== after.state.scoreA || before.state.scoreB !== after.state.scoreB) return before.state;
    const mix = (a: number, b: number) => a + (b - a) * (target - before.at) / (after.at - before.at);
    return { ...before.state, x: mix(before.state.x, after.state.x), y: mix(before.state.y, after.state.y),
      ay: mix(before.state.ay, after.state.ay), by: mix(before.state.by, after.state.by) };
  }
  const last = history[history.length - 1];
  const dt = clamp(target - last.at, 0, MAX_EXTRAPOLATION_MS) / 1000;
  const s = last.state;
  let x = s.x + s.vx * dt;
  // Wait at the paddle plane until the authoritative hit/miss arrives.
  if (s.vx < 0 && s.x >= 0.065) x = Math.max(0.065, x);
  if (s.vx > 0 && s.x <= 0.935) x = Math.min(0.935, x);
  let y = s.y + s.vy * dt;
  // Mirror wall motion, including multiple crossings for very fast balls.
  const folded = ((y - 0.025) % 1.9 + 1.9) % 1.9;
  y = 0.025 + (folded <= 0.95 ? folded : 1.9 - folded);
  return { ...s, x: clamp(x, -0.08, 1.08), y,
    ay: paddleTarget(s, 'A', last.at + dt * 1000), by: paddleTarget(s, 'B', last.at + dt * 1000) };
}
