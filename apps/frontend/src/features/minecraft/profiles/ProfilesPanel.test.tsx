// apps/frontend/src/features/minecraft/profiles/ProfilesPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProfile, deleteProfile, fetchProfiles, type MinecraftProfile } from "./api";
import { ProfilesPanel } from "./ProfilesPanel";

vi.mock("./api", () => ({
  fetchProfiles: vi.fn(),
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

const listMock = vi.mocked(fetchProfiles);
const createMock = vi.mocked(createProfile);
const deleteMock = vi.mocked(deleteProfile);

function makeProfile(overrides: Partial<MinecraftProfile> = {}): MinecraftProfile {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    username: "Steve",
    uuid: "22222222-2222-4222-8222-222222222222",
    online: false,
    whitelistStatus: "whitelisted",
    ...overrides,
  };
}

describe("ProfilesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists whitelisted profiles with their online status", async () => {
    listMock.mockResolvedValue([
      makeProfile({ id: "11111111-1111-4111-8111-111111111111", username: "Steve", online: true }),
      makeProfile({ id: "33333333-3333-4333-8333-333333333333", username: "Alex" }),
    ]);

    render(<ProfilesPanel />);

    expect(await screen.findByText("Steve")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows each profile's whitelist status", async () => {
    listMock.mockResolvedValue([
      makeProfile({ id: "11111111-1111-4111-8111-111111111111", username: "Steve" }),
      makeProfile({
        id: "33333333-3333-4333-8333-333333333333",
        username: "Alex",
        whitelistStatus: "pending",
      }),
      makeProfile({
        id: "44444444-4444-4444-8444-444444444444",
        username: "Notch",
        whitelistStatus: "failed",
      }),
    ]);

    render(<ProfilesPanel />);

    expect(await screen.findByText("Whitelisted")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("polls fast while a profile is pending and slows down once it settles", async () => {
    vi.useFakeTimers();
    try {
      listMock.mockResolvedValueOnce([makeProfile({ whitelistStatus: "pending" })]);
      listMock.mockResolvedValue([makeProfile({ whitelistStatus: "whitelisted" })]);

      render(<ProfilesPanel />);
      // Flush the initial load without waitFor, which fake timers would stall.
      await act(async () => {});
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(listMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(listMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Whitelisted")).toBeInTheDocument();

      // Settled, so the fast cadence is gone — 3s no longer refetches.
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(listMock).toHaveBeenCalledTimes(2);

      // ...but the slow one carries on, because online status never settles.
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      expect(listMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps refreshing online status when nothing is pending", async () => {
    vi.useFakeTimers();
    try {
      listMock.mockResolvedValueOnce([makeProfile({ username: "Steve", online: false })]);
      listMock.mockResolvedValue([makeProfile({ username: "Steve", online: true })]);

      render(<ProfilesPanel />);
      await act(async () => {});
      expect(screen.getByText("Offline")).toBeInTheDocument();

      // Nothing was ever pending here — the badge still has to catch the join.
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      expect(screen.getByText("Online")).toBeInTheDocument();
      expect(screen.queryByText("Offline")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the list on screen while a poll is in flight", async () => {
    vi.useFakeTimers();
    try {
      listMock.mockResolvedValue([makeProfile({ username: "Steve", whitelistStatus: "pending" })]);

      render(<ProfilesPanel />);
      await act(async () => {});

      // The refetch is in flight — the previous rows stay, no loading swap.
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(screen.getByText("Steve")).toBeInTheDocument();
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();

      await act(async () => {});
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the list on screen when a poll fails", async () => {
    vi.useFakeTimers();
    try {
      listMock.mockResolvedValueOnce([
        makeProfile({ username: "Steve", whitelistStatus: "pending" }),
      ]);
      listMock.mockRejectedValue(
        new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Could not reach the server."),
      );

      render(<ProfilesPanel />);
      await act(async () => {});
      expect(screen.getByText("Steve")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });

      // The failed poll reports itself beside the last good rows rather than
      // blanking them — and polling survives, so the list recovers on its own.
      expect(screen.getByText("Steve")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");
      expect(listMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refetches when Refresh is clicked", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce([makeProfile({ username: "Steve", online: false })]);
    listMock.mockResolvedValue([makeProfile({ username: "Steve", online: true })]);

    render(<ProfilesPanel />);
    expect(await screen.findByText("Offline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state when nothing is whitelisted", async () => {
    listMock.mockResolvedValue([]);

    render(<ProfilesPanel />);

    expect(await screen.findByText(/No profiles whitelisted yet\./)).toBeInTheDocument();
  });

  it("whitelists a username and reloads the list", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce([]);
    listMock.mockResolvedValue([makeProfile({ username: "Steve" })]);
    createMock.mockResolvedValue(makeProfile({ username: "Steve" }));

    render(<ProfilesPanel />);
    await screen.findByText(/No profiles whitelisted yet\./);

    // The backend resolves the canonical casing; the raw input is sent as-is.
    await user.type(screen.getByLabelText("Minecraft username"), "steve");
    await user.click(screen.getByRole("button", { name: "Whitelist" }));

    expect(await screen.findByText("Steve")).toBeInTheDocument();
    expect(createMock).toHaveBeenCalledWith("steve");
    // The whitelist command is still in flight at this point, so the notice
    // says added, not whitelisted.
    expect(screen.getByRole("status")).toHaveTextContent("Added!");
  });

  it("rejects an invalid username without calling the API", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([]);

    render(<ProfilesPanel />);
    await screen.findByText(/No profiles whitelisted yet\./);

    await user.type(screen.getByLabelText("Minecraft username"), "not valid");
    await user.click(screen.getByRole("button", { name: "Whitelist" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("3-16 characters");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("surfaces conflicts from the API", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([]);
    createMock.mockRejectedValue(
      new ApiError("CONFLICT", "MINECRAFT_USERNAME_TAKEN", "Already whitelisted."),
    );

    render(<ProfilesPanel />);
    await screen.findByText(/No profiles whitelisted yet\./);

    await user.type(screen.getByLabelText("Minecraft username"), "Steve");
    await user.click(screen.getByRole("button", { name: "Whitelist" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Already whitelisted.");
  });

  it("removes a profile after confirmation", async () => {
    const user = userEvent.setup();
    const profile = makeProfile();
    listMock.mockResolvedValueOnce([profile]);
    listMock.mockResolvedValue([]);
    deleteMock.mockResolvedValue(undefined);

    render(<ProfilesPanel />);
    await screen.findByText("Steve");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Are you sure?" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(profile.id));
    expect(await screen.findByText(/No profiles whitelisted yet\./)).toBeInTheDocument();
  });

  it("shows the load error", async () => {
    listMock.mockRejectedValue(
      new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Could not reach the server."),
    );

    render(<ProfilesPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });
});
