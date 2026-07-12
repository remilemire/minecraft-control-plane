// apps/frontend/src/app/providers/AuthProvider.test.tsx

import { loginWithGoogle, logout } from "@/features/auth/api";
import { fetchMe } from "@/features/users/api";
import { ApiError } from "@/lib/apiClient";
import { makeUser } from "@test/helpers/auth";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./auth-context";
import { AuthProvider } from "./AuthProvider";

vi.mock("@/features/users/api", () => ({ fetchMe: vi.fn() }));
vi.mock("@/features/auth/api", () => ({ loginWithGoogle: vi.fn(), logout: vi.fn() }));

const fetchMeMock = vi.mocked(fetchMe);
const loginMock = vi.mocked(loginWithGoogle);
const logoutMock = vi.mocked(logout);

function Probe() {
  const { status, user, login, logout: signOut } = useAuth();

  return (
    <div>
      <p>status: {status}</p>
      <p>email: {user?.email ?? "none"}</p>
      <button onClick={() => void login("credential").catch(() => undefined)}>login</button>
      <button onClick={() => void signOut()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores the session on mount", async () => {
    fetchMeMock.mockResolvedValue(makeUser({ email: "steve@example.com" }));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText("status: loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("status: authenticated")).toBeInTheDocument());
    expect(screen.getByText("email: steve@example.com")).toBeInTheDocument();
  });

  it("becomes unauthenticated when the session probe fails", async () => {
    fetchMeMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "UNAUTHENTICATED", "Nope."));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("status: unauthenticated")).toBeInTheDocument());
  });

  it("authenticates after a successful login", async () => {
    const user = userEvent.setup();
    fetchMeMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "UNAUTHENTICATED", "Nope."));
    loginMock.mockResolvedValue(makeUser({ email: "alex@example.com" }));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("status: unauthenticated")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(screen.getByText("status: authenticated")).toBeInTheDocument());
    expect(screen.getByText("email: alex@example.com")).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledWith("credential");
  });

  it("clears the session on logout even when the request fails", async () => {
    const user = userEvent.setup();
    fetchMeMock.mockResolvedValue(makeUser());
    logoutMock.mockRejectedValue(new ApiError("INTERNAL", "INTERNAL", "Boom."));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("status: authenticated")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(screen.getByText("status: unauthenticated")).toBeInTheDocument());
    expect(screen.getByText("email: none")).toBeInTheDocument();
  });
});
