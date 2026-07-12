// apps/frontend/src/components/McButton.test.tsx

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { McButton } from "./McButton";

describe("McButton", () => {
  it("defaults to type=button and fires clicks", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<McButton onClick={onClick}>Start</McButton>);

    const button = screen.getByRole("button", { name: "Start" });
    expect(button).toHaveAttribute("type", "button");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire clicks when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <McButton onClick={onClick} disabled>
        Start
      </McButton>,
    );

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
