// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ConnectionsPanel } from "./ConnectionsPanel";
import type { ConnectionPublic } from "@/lib/supabase/types";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const ROW: ConnectionPublic = {
  id: "c1",
  user_id: "u1",
  kind: "github",
  name: "My GitHub",
  url: "https://api.githubcopilot.com/mcp/",
  status: "untested",
  last_used_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ConnectionsPanel", () => {
  it("shows a loading state, then the empty state when there are no connections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ connections: [] })));
    render(<ConnectionsPanel />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/no connections yet/i)).toBeTruthy());
  });

  it("shows an honest error state when the list fetch fails, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "unauthorized" }, false, 401)));
    render(<ConnectionsPanel />);
    await waitFor(() => expect(screen.getByText("unauthorized")).toBeTruthy());
  });

  it("lists a connection with its health chip and never renders a secret field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ connections: [ROW] })));
    render(<ConnectionsPanel />);
    await waitFor(() => expect(screen.getByText("My GitHub")).toBeTruthy());
    expect(screen.getByText("UNTESTED")).toBeTruthy();
    expect(screen.queryByText(/secret/i)).toBeNull();
  });

  it("ADD opens the form prefilled with the github preset url, and SAVE posts kind/name/url/secret", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connections: [] })) // initial list
      .mockResolvedValueOnce(
        jsonResponse({
          connection: { ...ROW, name: "Renamed" },
        }),
      ); // POST create
    vi.stubGlobal("fetch", fetchMock);

    render(<ConnectionsPanel />);
    await waitFor(() => expect(screen.getByText(/no connections yet/i)).toBeTruthy());

    fireEvent.click(screen.getByText("ADD"));
    const form = screen.getByTestId("connection-form");
    expect(form).toBeTruthy();
    const urlInput = screen.getByPlaceholderText("https://…") as HTMLInputElement;
    expect(urlInput.value).toBe("https://api.githubcopilot.com/mcp/");

    fireEvent.click(screen.getByText("SAVE"));
    await waitFor(() => expect(screen.getByText("Renamed")).toBeTruthy());

    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe("/api/connections");
    const body = JSON.parse(postCall[1].body as string) as { kind: string; url: string };
    expect(body.kind).toBe("github");
    expect(body.url).toBe("https://api.githubcopilot.com/mcp/");
  });

  it("TEST calls the test route and updates the health chip from the response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connections: [ROW] }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConnectionsPanel />);
    await waitFor(() => expect(screen.getByText("My GitHub")).toBeTruthy());

    fireEvent.click(screen.getByText("TEST"));
    await waitFor(() => expect(screen.getByText("OK")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/connections/c1/test", { method: "POST" });
  });

  it("REVOKE calls DELETE and removes the row on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connections: [ROW] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConnectionsPanel />);
    await waitFor(() => expect(screen.getByText("My GitHub")).toBeTruthy());

    fireEvent.click(screen.getByText("REVOKE"));
    await waitFor(() => expect(screen.queryByText("My GitHub")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/connections/c1", { method: "DELETE" });
  });
});
