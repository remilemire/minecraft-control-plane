// apps/frontend/src/features/minecraft/server/ServerPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchServerStatus, restartServer, startServer, stopServer } from "./api";
import { ServerPanel } from "./ServerPanel";

vi.mock("./api", () => ({
  fetchServerStatus: vi.fn(),
  startServer: vi.fn(),
  stopServer: vi.fn(),
  restartServer: vi.fn(),
}));

const statusMock = vi.mocked(fetchServerStatus);
const startMock = vi.mocked(startServer);
const stopMock = vi.mocked(stopServer);
const restartMock = vi.mocked(restartServer);

describe("ServerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables Start while the server is running", async () => {
    statusMock.mockResolvedValue("RUNNING");

    render(<ServerPanel />);

    expect(await screen.findByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Restart" })).toBeEnabled();
  });

  it("disables Stop and Restart while the server is stopped", async () => {
    statusMock.mockResolvedValue("STOPPED");

    render(<ServerPanel />);

    expect(await screen.findByText("STOPPED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restart" })).toBeDisabled();
  });

  it("starts the server and refreshes the status", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValueOnce("STOPPED");
    statusMock.mockResolvedValue("RUNNING");
    startMock.mockResolvedValue(undefined);

    render(<ServerPanel />);
    await screen.findByText("STOPPED");

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("RUNNING")).toBeInTheDocument();
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("restarts the server", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue("RUNNING");
    restartMock.mockResolvedValue(undefined);

    render(<ServerPanel />);
    await screen.findByText("RUNNING");

    await user.click(screen.getByRole("button", { name: "Restart" }));

    await waitFor(() => expect(restartMock).toHaveBeenCalledTimes(1));
  });

  it("polls the status and picks up a change made outside the panel", async () => {
    vi.useFakeTimers();
    try {
      statusMock.mockResolvedValueOnce("RUNNING");
      statusMock.mockResolvedValue("STOPPED");

      render(<ServerPanel />);
      // Flush the initial load without waitFor, which fake timers would stall.
      await act(async () => {});
      expect(screen.getByText("RUNNING")).toBeInTheDocument();
      expect(statusMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      expect(statusMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText("STOPPED")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the badge and the controls live while a poll is in flight", async () => {
    vi.useFakeTimers();
    try {
      statusMock.mockResolvedValue("RUNNING");

      render(<ServerPanel />);
      await act(async () => {});

      // The refetch is in flight — the badge stays put and nothing disables.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.getByText("RUNNING")).toBeInTheDocument();
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();

      await act(async () => {});
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows action errors", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue("RUNNING");
    stopMock.mockRejectedValue(
      new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Docker unreachable."),
    );

    render(<ServerPanel />);
    await screen.findByText("RUNNING");

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Docker unreachable.");
  });
});
