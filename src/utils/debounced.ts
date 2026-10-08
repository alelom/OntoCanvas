/** A function run `delayMs` after the last `schedule()`, unless `cancel()` drops the pending run. */
export function debounced(fn: () => void, delayMs: number): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule: () => {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, delayMs);
    },
    cancel,
  };
}
