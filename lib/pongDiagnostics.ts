// Opt in for a test build. No player IDs, room contents or tokens are logged.
const enabled = process.env.EXPO_PUBLIC_PONG_DIAGNOSTICS === 'true';
export function createPongDiagnostics() {
  let started = performance.now();
  const samples = new Map<string, number[]>();
  return (metric: string, milliseconds: number) => {
    if (!enabled || !Number.isFinite(milliseconds)) return;
    const values = samples.get(metric) ?? [];
    values.push(Math.max(0, milliseconds));
    samples.set(metric, values.slice(-256));
    if (performance.now() - started < 10000) return;
    const summary = Object.fromEntries([...samples].map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [name, { count: values.length, medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
        p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]) }];
    }));
    console.info('[Pong timing]', summary);
    samples.clear();
    started = performance.now();
  };
}
