// apps/frontend/src/lib/usePoll.ts

import { useEffect, useRef } from "react";

/**
 * Calls `onPoll` every `intervalMs` for as long as the page is visible, and
 * once immediately whenever it becomes visible again.
 *
 * Polling a hidden tab buys nothing — nobody is looking, and browsers throttle
 * background timers anyway — but coming back to a stale view is a real bug, so
 * the return trip refetches rather than waiting out an interval the user never
 * saw start. `hidden` is tab-switched, minimised, or phone-locked; a window
 * that is merely unfocused is still visible and keeps polling, which is right,
 * because its data is still on screen.
 *
 * Pass a changing `intervalMs` to change cadence (a panel may poll faster while
 * something is settling); the new interval takes over from that moment.
 * `onPoll` may have any identity — it is read through a ref, so an inline
 * arrow won't restart the interval on every render.
 */
export function usePoll(onPoll: () => void, intervalMs: number): void {
  const latest = useRef(onPoll);

  useEffect(() => {
    latest.current = onPoll;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    function start() {
      if (timer === undefined && document.visibilityState === "visible") {
        timer = setInterval(() => latest.current(), intervalMs);
      }
    }

    function stop() {
      clearInterval(timer);
      timer = undefined;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        latest.current();
        start();
      } else {
        stop();
      }
    }

    // Mount doesn't poll immediately: the caller's own initial load just ran.
    start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);
}
