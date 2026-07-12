// apps/frontend/src/components/McConfirmButton.test.tsx

import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McConfirmButton } from "./McConfirmButton";

describe("McConfirmButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires a second click to confirm", () => {
    const onConfirm = vi.fn();
    render(<McConfirmButton onConfirm={onConfirm}>Delete</McConfirmButton>);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Are you sure?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Are you sure?" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("disarms after the timeout", () => {
    const onConfirm = vi.fn();
    render(<McConfirmButton onConfirm={onConfirm}>Delete</McConfirmButton>);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Are you sure?" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
