// apps/frontend/src/features/minecraft/server/console/ConsolePanel.test.tsx

import { ApiError } from "@/lib/apiClient";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openConsoleLogStream, sendConsoleCommand, type ConsoleLogStreamHandlers } from "./api";
import { ConsolePanel } from "./ConsolePanel";

vi.mock("./api", () => ({
  openConsoleLogStream: vi.fn(),
  sendConsoleCommand: vi.fn(),
}));

const openMock = vi.mocked(openConsoleLogStream);
const sendMock = vi.mocked(sendConsoleCommand);
const closeMock = vi.fn();

let handlers: ConsoleLogStreamHandlers;

// jsdom has no layout, so the log view's scroll metrics are stubbed; scrollTop
// stays writable so both the user (tests) and the auto-scroll can move it.
function mockScrollMetrics(
  view: HTMLElement,
  { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number },
): void {
  let scrollTop = 0;
  Object.defineProperty(view, "scrollHeight", { configurable: true, get: () => scrollHeight });
  Object.defineProperty(view, "clientHeight", { configurable: true, get: () => clientHeight });
  Object.defineProperty(view, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

describe("ConsolePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockImplementation((streamHandlers) => {
      handlers = streamHandlers;
      return closeMock;
    });
  });

  it("streams log lines into the console once connected", () => {
    render(<ConsolePanel />);

    expect(screen.getByText("Connecting...")).toBeInTheDocument();

    act(() => {
      handlers.onOpen();
      handlers.onLog({ stream: "stdout", line: "Done (3.421s)!" });
      handlers.onLog({ stream: "stderr", line: "A warning" });
    });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Done (3.421s)!")).toBeInTheDocument();
    expect(screen.getByText("A warning")).toBeInTheDocument();
    expect(screen.queryByText("No console output yet.")).not.toBeInTheDocument();
  });
  it("keeps logs readable while maintenance disables command entry", () => {
    render(
      <ConsolePanel
        maintenance={{
          id: crypto.randomUUID(),
          kind: "backup",
          status: "running",
          phase: "Creating backup",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          backupId: null,
          safetyBackupId: null,
          error: null,
        }}
      />,
    );
    act(() => {
      handlers.onOpen();
      handlers.onLog({ stream: "stdout", line: "Saved the game" });
    });
    expect(screen.getByText("Saved the game")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("keeps the RCON polling churn out of the log view", () => {
    render(<ConsolePanel />);

    act(() => {
      handlers.onOpen();
      handlers.onLog({
        stream: "stdout",
        line: "[02:33:29 INFO]: Thread RCON Client /1.2.3.4 shutting down",
      });
      handlers.onLog({
        stream: "stdout",
        line: "[02:33:44 INFO]: Thread RCON Client /1.2.3.4 started",
      });
      handlers.onLog({ stream: "stdout", line: "[02:33:45 INFO]: Steve joined the game" });
    });

    expect(screen.getByText(/Steve joined the game/)).toBeInTheDocument();
    expect(screen.queryByText(/Thread RCON Client/)).not.toBeInTheDocument();
  });

  it("marks a drop and its recovery with seam notices", () => {
    render(<ConsolePanel />);

    act(() => {
      handlers.onOpen();
    });
    // The browser retries on its own — every failed attempt reports again.
    act(() => {
      handlers.onReconnecting();
      handlers.onReconnecting();
    });

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
    expect(screen.getAllByText(/Connection lost/)).toHaveLength(1);

    act(() => {
      handlers.onOpen();
    });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText(/Reconnected — recent lines may repeat/)).toBeInTheDocument();
  });

  it("keeps showing Connecting while the first connect has not succeeded", () => {
    render(<ConsolePanel />);

    act(() => {
      handlers.onReconnecting();
    });

    expect(screen.getByText("Connecting...")).toBeInTheDocument();
    expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument();
  });

  it("offers Reconnect after the stream closes for good", async () => {
    const user = userEvent.setup();
    render(<ConsolePanel />);

    act(() => {
      handlers.onOpen();
      handlers.onClosed();
    });

    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(screen.getByText(/Log stream disconnected/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledTimes(2);

    act(() => {
      handlers.onOpen();
    });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText(/Reconnected — recent lines may repeat/)).toBeInTheDocument();
  });

  it("follows new lines while the user is at the bottom", () => {
    render(<ConsolePanel />);
    const view = screen.getByRole("log");
    mockScrollMetrics(view, { scrollHeight: 1000, clientHeight: 200 });
    view.scrollTop = 800; // at the bottom

    act(() => {
      handlers.onOpen();
      handlers.onLog({ stream: "stdout", line: "tick" });
    });

    expect(view.scrollTop).toBe(1000);
  });

  it("stops following once the user scrolls up, and resumes at the bottom", () => {
    render(<ConsolePanel />);
    const view = screen.getByRole("log");
    mockScrollMetrics(view, { scrollHeight: 1000, clientHeight: 200 });
    view.scrollTop = 100; // reading history

    act(() => {
      handlers.onOpen();
      handlers.onLog({ stream: "stdout", line: "tick" });
    });

    expect(view.scrollTop).toBe(100);

    view.scrollTop = 800; // back at the bottom

    act(() => {
      handlers.onLog({ stream: "stdout", line: "tock" });
    });

    expect(view.scrollTop).toBe(1000);
  });

  it("keeps only the newest lines in the buffer", () => {
    render(<ConsolePanel />);

    act(() => {
      handlers.onOpen();
      for (let index = 0; index <= 500; index++) {
        handlers.onLog({ stream: "stdout", line: `line ${index}` });
      }
    });

    expect(screen.queryByText("line 0")).not.toBeInTheDocument();
    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(screen.getByText("line 500")).toBeInTheDocument();
  });

  it("echoes the command before the round trip settles", async () => {
    const user = userEvent.setup();
    let resolveSend!: () => void;
    sendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = () => resolve(undefined);
        }),
    );
    render(<ConsolePanel />);

    const input = screen.getByLabelText("Console command");
    await user.type(input, "say Hello world");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The POST has not resolved yet — the echo must already be in the log, so
    // the server's own log lines for the command can only land below it.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("> say Hello world")).toBeInTheDocument();

    await act(async () => {
      resolveSend();
    });
    expect(input).toHaveValue("");
  });

  it("sends the trimmed command, echoes it, and clears the input", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue(undefined);
    render(<ConsolePanel />);

    const input = screen.getByLabelText("Console command");
    await user.type(input, "  say Hello world  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMock).toHaveBeenCalledWith("say Hello world");
    expect(screen.getByText("> say Hello world")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("disables Send while the command is blank", async () => {
    const user = userEvent.setup();
    render(<ConsolePanel />);

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText("Console command"), "   ");
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText("Console command"), "list");
    expect(sendButton).toBeEnabled();
  });

  it("surfaces command errors and keeps the input", async () => {
    const user = userEvent.setup();
    sendMock.mockRejectedValue(
      new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "RCON unreachable."),
    );
    render(<ConsolePanel />);

    const input = screen.getByLabelText("Console command");
    await user.type(input, "say hi");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("RCON unreachable.");
    expect(input).toHaveValue("say hi");
    // The attempt was echoed — the error below the form says how it went.
    expect(screen.getByText("> say hi")).toBeInTheDocument();
  });

  it("closes the stream on unmount", () => {
    const { unmount } = render(<ConsolePanel />);

    unmount();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
