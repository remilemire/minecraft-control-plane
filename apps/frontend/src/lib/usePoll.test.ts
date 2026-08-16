// apps/frontend/src/lib/usePoll.test.ts

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePoll } from "./usePoll";

// jsdom has no visibility model: the property is a plain getter that always
// reads "visible", so tests drive it directly and fire the event themselves.
function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("usePoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls the callback on each interval", () => {
    const onPoll = vi.fn();
    renderHook(() => usePoll(onPoll, 1_000));

    // Mount doesn't poll — the caller's own initial load just ran.
    expect(onPoll).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("stops polling while the page is hidden", () => {
    const onPoll = vi.fn();
    renderHook(() => usePoll(onPoll, 1_000));

    setVisibility("hidden");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("polls once immediately when the page becomes visible again", () => {
    const onPoll = vi.fn();
    renderHook(() => usePoll(onPoll, 1_000));

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    // The catch-up: whatever changed while hidden shows up now, not at the
    // end of an interval the user never saw start.
    setVisibility("visible");
    expect(onPoll).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("switches cadence when the interval changes", () => {
    const onPoll = vi.fn();
    const { rerender } = renderHook(({ ms }) => usePoll(onPoll, ms), {
      initialProps: { ms: 1_000 },
    });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);

    rerender({ ms: 10_000 });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("keeps the interval running across renders with a fresh callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ onPoll }) => usePoll(onPoll, 1_000), {
      initialProps: { onPoll: first },
    });

    // An unstable callback must not restart the interval — that would reset
    // the deadline every render and the poll would never fire.
    rerender({ onPoll: second });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops polling once unmounted", () => {
    const onPoll = vi.fn();
    const { unmount } = renderHook(() => usePoll(onPoll, 1_000));

    unmount();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onPoll).not.toHaveBeenCalled();
  });
});
