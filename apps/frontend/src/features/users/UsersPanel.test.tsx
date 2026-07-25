// apps/frontend/src/features/users/UsersPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { makeUser } from "@test/helpers/auth";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUsers } from "./api";
import { UsersPanel } from "./UsersPanel";

vi.mock("./api", () => ({ fetchUsers: vi.fn() }));

const fetchUsersMock = vi.mocked(fetchUsers);

describe("UsersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every registered user", async () => {
    fetchUsersMock.mockResolvedValue([
      makeUser({ id: "11111111-1111-4111-8111-111111111111" }),
      makeUser({
        id: "22222222-2222-4222-8222-222222222222",
        email: "alex@example.com",
        fullName: "Alex",
      }),
    ]);

    render(<UsersPanel />);

    expect(await screen.findByText("Steve Miner")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });

  it("falls back to the email when the user has no name", async () => {
    fetchUsersMock.mockResolvedValue([makeUser({ email: "no-name@example.com", fullName: null })]);

    render(<UsersPanel />);

    expect(await screen.findAllByText(/no-name@example.com/)).not.toHaveLength(0);
  });

  it("shows load errors", async () => {
    fetchUsersMock.mockRejectedValue(
      new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Could not reach the server."),
    );

    render(<UsersPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });
});
