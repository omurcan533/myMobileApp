/** Derive every highlight from elapsed time, so delayed timers cannot skip cleanup. */
export function memoryFrame(sequence: number[], startedAt: number | null, now: number) {
  const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt);
  const step = Math.floor((elapsed - 500) / 650);
  const showing = startedAt === null || elapsed < 500 + sequence.length * 650 + 150;
  const highlighted = showing && step >= 0 && step < sequence.length && (elapsed - 500) % 650 < 480;
  return { showing, activeStep: highlighted ? sequence[step] : null, showingStep: highlighted ? step + 1 : null };
}
