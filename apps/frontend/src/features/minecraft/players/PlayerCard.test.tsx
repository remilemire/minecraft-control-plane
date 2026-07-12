// apps/frontend/src/features/minecraft/players/PlayerCard.test.tsx

import { ApiError } from "@/lib/apiClient";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMyPlayer, setMyPlayer, type MinecraftPlayer } from "./api";
import { PlayerCard } from "./PlayerCard";

vi.mock("./api", () => ({ fetchMyPlayer: vi.fn(), setMyPlayer: vi.fn() }));

const fetchMyPlayerMock = vi.mocked(fetchMyPlayer);
const setMyPlayerMock = vi.mocked(setMyPlayer);

const notLinkedError = new ApiError(
  "NOT_FOUND",
  "MINECRAFT_PROFILE_NOT_FOUND",
  "No Minecraft profile.",
);

function makePlayer(overrides: Partial<MinecraftPlayer> = {}): MinecraftPlayer {
  return {
    userId: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
    username: "Steve",
    uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    online: true,
    ...overrides,
  };
}

describe("PlayerCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the linked player with online status", async () => {
    fetchMyPlayerMock.mockResolvedValue(makePlayer());

    render(<PlayerCard />);

    expect(await screen.findByText("Steve")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("offers to link an account when none is linked", async () => {
    fetchMyPlayerMock.mockRejectedValue(notLinkedError);

    render(<PlayerCard />);

    expect(await screen.findByRole("button", { name: "Link account" })).toBeInTheDocument();
  });

  it("surfaces unexpected load errors with a retry", async () => {
    fetchMyPlayerMock.mockRejectedValue(
      new ApiError("SERVICE_UNAVAILABLE", "RCON_CLIENT_ERROR", "RCON down."),
    );

    render(<PlayerCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent("RCON down.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("rejects an invalid username without calling the API", async () => {
    const user = userEvent.setup();
    fetchMyPlayerMock.mockRejectedValue(notLinkedError);

    render(<PlayerCard />);
    await screen.findByRole("button", { name: "Link account" });

    await user.type(screen.getByLabelText("Minecraft username"), "x!");
    await user.click(screen.getByRole("button", { name: "Link account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("3-16 characters");
    expect(setMyPlayerMock).not.toHaveBeenCalled();
  });

  it("links a valid username and reloads the player", async () => {
    const user = userEvent.setup();
    fetchMyPlayerMock.mockRejectedValueOnce(notLinkedError);
    fetchMyPlayerMock.mockResolvedValue(makePlayer({ username: "Alex", online: false }));
    setMyPlayerMock.mockResolvedValue(makePlayer({ username: "Alex", online: false }));

    render(<PlayerCard />);
    await screen.findByRole("button", { name: "Link account" });

    await user.type(screen.getByLabelText("Minecraft username"), "Alex");
    await user.click(screen.getByRole("button", { name: "Link account" }));

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(setMyPlayerMock).toHaveBeenCalledWith("Alex");
    expect(screen.getByText(/Whitelisted!/)).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows the server's message when linking fails", async () => {
    const user = userEvent.setup();
    fetchMyPlayerMock.mockRejectedValue(notLinkedError);
    setMyPlayerMock.mockRejectedValue(
      new ApiError("NOT_FOUND", "MOJANG_PROFILE_NOT_FOUND", "No Mojang account."),
    );

    render(<PlayerCard />);
    await screen.findByRole("button", { name: "Link account" });

    await user.type(screen.getByLabelText("Minecraft username"), "Nobody123");
    await user.click(screen.getByRole("button", { name: "Link account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No Mojang account.");
  });
});
