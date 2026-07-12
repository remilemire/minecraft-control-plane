// apps/frontend/src/features/invitations/InvitationsPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInvitation, deleteInvitation, fetchInvitations, type Invitation } from "./api";
import { InvitationsPanel } from "./InvitationsPanel";

vi.mock("./api", () => ({
  fetchInvitations: vi.fn(),
  createInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
}));

const listMock = vi.mocked(fetchInvitations);
const createMock = vi.mocked(createInvitation);
const deleteMock = vi.mocked(deleteInvitation);

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "player@example.com",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
    acceptedAt: null,
    ...overrides,
  };
}

describe("InvitationsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels invitations as pending, accepted, or expired", async () => {
    listMock.mockResolvedValue([
      makeInvitation({ id: "11111111-1111-4111-8111-111111111111", email: "a@example.com" }),
      makeInvitation({
        id: "22222222-2222-4222-8222-222222222222",
        email: "b@example.com",
        acceptedAt: new Date("2026-07-02T00:00:00Z"),
      }),
      makeInvitation({
        id: "33333333-3333-4333-8333-333333333333",
        email: "c@example.com",
        expiresAt: new Date(Date.now() - 24 * 3_600_000),
      }),
    ]);

    render(<InvitationsPanel />);

    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("creates an invitation and reloads the list", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce([]);
    listMock.mockResolvedValue([makeInvitation({ email: "new@example.com" })]);
    createMock.mockResolvedValue(makeInvitation({ email: "new@example.com" }));

    render(<InvitationsPanel />);
    await screen.findByText("No invitations yet.");

    await user.type(screen.getByLabelText("Email address"), "New@Example.com");
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
    // The shared schema normalizes the email before it is sent.
    expect(createMock).toHaveBeenCalledWith("new@example.com");
  });

  it("rejects an invalid email without calling the API", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([]);

    render(<InvitationsPanel />);
    await screen.findByText("No invitations yet.");

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("valid email");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("surfaces conflicts from the API", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([]);
    createMock.mockRejectedValue(
      new ApiError("CONFLICT", "INVITATION_ALREADY_EXISTS", "Already invited."),
    );

    render(<InvitationsPanel />);
    await screen.findByText("No invitations yet.");

    await user.type(screen.getByLabelText("Email address"), "player@example.com");
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Already invited.");
  });

  it("deletes an invitation after confirmation", async () => {
    const user = userEvent.setup();
    const invitation = makeInvitation();
    listMock.mockResolvedValueOnce([invitation]);
    listMock.mockResolvedValue([]);
    deleteMock.mockResolvedValue(invitation);

    render(<InvitationsPanel />);
    await screen.findByText("player@example.com");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Are you sure?" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(invitation.id));
    expect(await screen.findByText("No invitations yet.")).toBeInTheDocument();
  });
});
