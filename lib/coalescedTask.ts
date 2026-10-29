/** Serialize a burst into one current fetch and at most one queued fetch. */
export function coalescedTask(task: () => Promise<void>, active: () => boolean) {
  let running: Promise<void> | null = null;
  let dirty = false;
  return () => {
    if (!active()) return Promise.resolve();
    dirty = true;
    if (!running) {
      running = (async () => {
        try {
          while (dirty && active()) { dirty = false; await task(); }
        } finally { running = null; }
      })();
    }
    return running;
  };
}
