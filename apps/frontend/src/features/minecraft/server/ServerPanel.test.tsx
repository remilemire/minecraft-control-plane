// apps/frontend/src/features/minecraft/server/ServerPanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { render, screen, waitFor } from "@testing-library/react";
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
