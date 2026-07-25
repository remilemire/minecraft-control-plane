// apps/frontend/src/features/minecraft/profiles/ProfilesPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByRole("status")).toHaveTextContent("Whitelisted!");
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
