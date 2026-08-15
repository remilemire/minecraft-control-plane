// apps/frontend/src/features/users/UsersPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { makeAuthValue, makeUser, renderWithAuth } from "@test/helpers/auth";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, fetchUsers, transferOwnership } from "./api";
import { UsersPanel } from "./UsersPanel";

vi.mock("./api", () => ({
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  transferOwnership: vi.fn(),
}));

const listMock = vi.mocked(fetchUsers);
const createMock = vi.mocked(createUser);
const transferMock = vi.mocked(transferOwnership);

const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function ownerAuth() {
  return makeAuthValue({ user: makeUser({ isOwner: true }) });
}

describe("UsersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every registered user, read-only for a non-owner", async () => {
    listMock.mockResolvedValue([
      makeUser(),
      makeUser({ id: OTHER_ID, email: "alex@example.com", fullName: "Alex" }),
    ]);

    renderWithAuth(<UsersPanel />);

    expect(await screen.findByText("Steve Miner")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    // Non-owners get no provisioning form and no transfer actions.
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make owner" })).not.toBeInTheDocument();
  });

  it("falls back to the email when the user has no name", async () => {
    listMock.mockResolvedValue([makeUser({ email: "no-name@example.com", fullName: null })]);

    renderWithAuth(<UsersPanel />);

    expect(await screen.findAllByText(/no-name@example.com/)).not.toHaveLength(0);
  });

  it("badges the owner's row", async () => {
    listMock.mockResolvedValue([
      makeUser({ isOwner: true }),
      makeUser({ id: OTHER_ID, email: "alex@example.com", fullName: "Alex" }),
    ]);

    renderWithAuth(<UsersPanel />);

    expect(await screen.findByText("Owner")).toBeInTheDocument();
  });

  it("badges accounts that have never signed in", async () => {
    listMock.mockResolvedValue([
      makeUser(),
      makeUser({
        id: OTHER_ID,
        email: "provisioned@example.com",
        fullName: null,
        lastLoginAt: null,
      }),
    ]);

    renderWithAuth(<UsersPanel />);

    expect(await screen.findAllByText("Never signed in")).toHaveLength(1);
  });

  it("lets the owner provision a user and reloads the list", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce([makeUser({ isOwner: true })]);
    listMock.mockResolvedValue([
      makeUser({ isOwner: true }),
      makeUser({ id: OTHER_ID, email: "new@example.com", fullName: null }),
    ]);
    createMock.mockResolvedValue(makeUser({ id: OTHER_ID, email: "new@example.com" }));

    renderWithAuth(<UsersPanel />, { auth: ownerAuth() });
    await screen.findByText("Steve Miner");

    await user.type(screen.getByLabelText("Email address"), "New@Example.com");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findAllByText(/new@example.com/)).not.toHaveLength(0);
    // The shared schema normalizes the email before it is sent.
    expect(createMock).toHaveBeenCalledWith("new@example.com");
  });

  it("rejects an invalid email without calling the API", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([makeUser({ isOwner: true })]);

    renderWithAuth(<UsersPanel />, { auth: ownerAuth() });
    await screen.findByText("Steve Miner");

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("valid email");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("lets the owner transfer ownership after confirmation, but not to themselves", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce([
      makeUser({ isOwner: true }),
      makeUser({ id: OTHER_ID, email: "alex@example.com", fullName: "Alex" }),
    ]);
    listMock.mockResolvedValue([
      makeUser({ isOwner: false }),
      makeUser({ id: OTHER_ID, email: "alex@example.com", fullName: "Alex", isOwner: true }),
    ]);
    transferMock.mockResolvedValue(makeUser({ id: OTHER_ID, isOwner: true }));

    renderWithAuth(<UsersPanel />, { auth: ownerAuth() });
    await screen.findByText("Alex");

    // Only the other user's row gets the action — never the owner's own row.
    const transferButtons = screen.getAllByRole("button", { name: "Make owner" });
    expect(transferButtons).toHaveLength(1);

    await user.click(transferButtons[0] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Are you sure?" }));

    await waitFor(() => expect(transferMock).toHaveBeenCalledWith(OTHER_ID));
  });

  it("shows load errors", async () => {
    listMock.mockRejectedValue(
      new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Could not reach the server."),
    );

    renderWithAuth(<UsersPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });
});
