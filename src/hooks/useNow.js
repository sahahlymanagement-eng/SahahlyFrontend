import { useEffect, useState } from "react";

/**
 * The wall clock as a timestamp, re-read on an interval.
 *
 * For anything whose appearance depends on "is it past X yet" — a deadline that
 * should turn red on its own rather than waiting for an unrelated re-render.
 * Reading Date.now() during render would make the component impure, so the
 * clock is state and the interval is what advances it.
 *
 * `useState(Date.now)` passes the function; React calls it for the initial
 * value, so no clock read happens in the render body.
 *
 * @param {number} [intervalMs] how often to re-read. One minute by default,
 *   which is the resolution a human-facing deadline actually needs.
 */
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export default useNow;
