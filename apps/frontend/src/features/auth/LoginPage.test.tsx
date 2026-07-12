// apps/frontend/src/features/auth/LoginPage.test.tsx

import { ApiError } from "@/lib/apiClient";
import { makeAuthValue, makeUser, renderWithAuth } from "@test/helpers/auth";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

// The real button embeds Google's iframe; replace it with a plain trigger.
vi.mock("./GoogleSignInButton", () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (credential: string) => void }) => (
    <button onClick={() => onCredential("google-credential")}>Sign in with Google</button>
  ),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in with the Google credential", async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue(makeUser());
    renderWithAuth(<LoginPage />, {
      auth: makeAuthValue({ status: "unauthenticated", user: null, login }),
    });

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(login).toHaveBeenCalledWith("google-credential");
  });

  it("shows the backend's message when the login is rejected", async () => {
    const user = userEvent.setup();
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError("FORBIDDEN", "NOT_INVITED", "You need an invitation."));
    renderWithAuth(<LoginPage />, {
      auth: makeAuthValue({ status: "unauthenticated", user: null, login }),
    });

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You need an invitation.");
  });
});
