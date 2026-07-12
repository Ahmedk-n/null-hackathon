// @vitest-environment jsdom
// P5-T14 · /account — LOADING / GUEST (empty) / SIGNED IN states, plus the two privacy actions:
// Export (download decisions JSON via /api/decisions) and Delete account (confirm → POST
// /api/account/delete). Mocks useSession + the browser Supabase client directly (unit-level —
// each hook/route has its own test); fetch is mocked per-test.
// P2-T6 adds: the "Your decisions" list + per-entry outcome resolution (HELD/FAILED), backed by
// @/lib/library's listEntries/resolveOutcome — mocked here directly so no local/remote backend is
// exercised.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act, waitFor, within } from "@testing-library/react";
import AccountPage from "./page";
import type { LibraryEntry } from "@/lib/library";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/useSession", () => ({ useSession: useSessionMock }));

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth: { signOut: signOutMock } }),
}));

const { listEntriesMock, resolveOutcomeMock } = vi.hoisted(() => ({
  listEntriesMock: vi.fn(),
  resolveOutcomeMock: vi.fn(),
}));
vi.mock("@/lib/library", () => ({
  listEntries: listEntriesMock,
  resolveOutcome: resolveOutcomeMock,
}));

function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: "d-1",
    title: "Ship it",
    savedAtISO: "2026-07-01T10:00:00Z",
    seq: 1,
    mode: "A",
    input: { businessContextText: "", technicalContextText: "", temporalContextText: "", decisionText: "d" },
    companyContext: null,
    pack: null,
    graph: { thesisId: "t", nodes: [{ id: "t", type: "thesis", label: "T", confidence: 0.8, groups: [] }] },
    verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false },
    ...overrides,
  };
}

// jsdom doesn't implement createObjectURL/revokeObjectURL — the Export flow only needs them to
// exist and not throw; the actual blob content isn't observable through the DOM anyway.
beforeEach(() => {
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => "blob:fake");
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  signOutMock.mockClear();
  vi.stubGlobal("fetch", vi.fn());
  delete (window as { location?: unknown }).location;
  (window as { location: { href: string } }).location = { href: "" } as { href: string };
  listEntriesMock.mockReset();
  listEntriesMock.mockResolvedValue([]);
  resolveOutcomeMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountPage", () => {
  it("LOADING — shows a quiet placeholder while the session resolves", () => {
    useSessionMock.mockReturnValue({ user: null, loading: true });
    const { getByTestId } = render(<AccountPage />);
    expect(getByTestId("account-loading")).toBeTruthy();
  });

  it("GUEST (empty state) — prompts sign-in, no email/export/delete UI", () => {
    useSessionMock.mockReturnValue({ user: null, loading: false });
    const { getByTestId, queryByText } = render(<AccountPage />);
    expect(getByTestId("account-guest")).toBeTruthy();
    expect(queryByText("Export decisions")).toBeNull();
    expect(queryByText("Delete account")).toBeNull();
  });

  it("SIGNED IN — shows the email and the Export / Delete actions", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    const { getByTestId, getByText, findByTestId } = render(<AccountPage />);
    const panel = getByTestId("account-signed-in");
    expect(panel.textContent).toContain("a@b.com");
    expect(getByText("Export decisions")).toBeTruthy();
    expect(getByText("Delete account")).toBeTruthy();
    await findByTestId("decisions-empty"); // flush the listEntries() effect (avoids an act() warning)
  });

  it("Export — success downloads the decisions and returns to idle (no error state shown)", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [{ id: "d-1" }] }),
    });
    const { getByText, queryByTestId } = render(<AccountPage />);
    await act(async () => {
      fireEvent.click(getByText("Export decisions"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledWith("/api/decisions");
    expect(queryByTestId("export-error")).toBeNull();
  });

  it("Export — error state shown on a failed fetch", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const { getByText, findByTestId } = render(<AccountPage />);
    await act(async () => {
      fireEvent.click(getByText("Export decisions"));
    });
    expect(await findByTestId("export-error")).toBeTruthy();
  });

  it("Delete — requires confirmation before calling the route", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    const { getByText, queryByText, findByTestId } = render(<AccountPage />);
    await findByTestId("decisions-empty"); // flush the listEntries() effect (avoids an act() warning)
    fireEvent.click(getByText("Delete account"));
    expect(queryByText("Confirm delete")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete — confirmed calls POST /api/account/delete, signs out, and redirects", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { getByText } = render(<AccountPage />);
    fireEvent.click(getByText("Delete account"));
    await act(async () => {
      fireEvent.click(getByText("Confirm delete"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledWith("/api/account/delete", { method: "POST" });
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect((window as unknown as { location: { href: string } }).location.href).toBe("/");
  });

  it("Delete — error state shown on a failed delete, account NOT signed out", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "nope" }),
    });
    const { getByText, findByTestId } = render(<AccountPage />);
    fireEvent.click(getByText("Delete account"));
    await act(async () => {
      fireEvent.click(getByText("Confirm delete"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await findByTestId("delete-error")).toBeTruthy();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});

describe("AccountPage — Your decisions (outcome resolution)", () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
  });

  it("empty — shows a message when there are no saved decisions", async () => {
    listEntriesMock.mockResolvedValue([]);
    const { findByTestId } = render(<AccountPage />);
    expect(await findByTestId("decisions-empty")).toBeTruthy();
  });

  it("unresolved entry shows HELD/FAILED controls; resolved entry shows its recorded outcome", async () => {
    const unresolved = makeEntry({ id: "d-1", title: "Unresolved decision" });
    const resolved = makeEntry({
      id: "d-2",
      title: "Resolved decision",
      outcome: "held",
      resolvedAtISO: "2026-07-05T12:00:00Z",
    });
    listEntriesMock.mockResolvedValue([unresolved, resolved]);
    const { findByTestId } = render(<AccountPage />);

    const unresolvedRow = await findByTestId("decision-row-d-1");
    expect(within(unresolvedRow).getByText("HELD")).toBeTruthy();
    expect(within(unresolvedRow).getByText("FAILED")).toBeTruthy();

    const resolvedRow = await findByTestId("decision-row-d-2");
    expect(within(resolvedRow).getByTestId("decision-outcome-d-2").textContent).toMatch(/HELD/);
    expect(within(resolvedRow).queryByText("FAILED")).toBeNull();
  });

  it('clicking FAILED calls resolveOutcome(id, "failed") and updates the row in place', async () => {
    const unresolved = makeEntry({ id: "d-9" });
    listEntriesMock.mockResolvedValue([unresolved]);
    resolveOutcomeMock.mockResolvedValue({
      ...unresolved,
      outcome: "failed",
      resolvedAtISO: "2026-07-06T00:00:00Z",
    });
    const { findByTestId } = render(<AccountPage />);
    const row = await findByTestId("decision-row-d-9");
    await act(async () => {
      fireEvent.click(within(row).getByText("FAILED"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(resolveOutcomeMock).toHaveBeenCalledWith("d-9", "failed");
    await waitFor(() =>
      expect(within(row).getByTestId("decision-outcome-d-9").textContent).toMatch(/FAILED/),
    );
  });

  it("resolveOutcome returning null (failure) shows an inline error and never throws", async () => {
    const unresolved = makeEntry({ id: "d-8" });
    listEntriesMock.mockResolvedValue([unresolved]);
    resolveOutcomeMock.mockResolvedValue(null);
    const { findByTestId } = render(<AccountPage />);
    const row = await findByTestId("decision-row-d-8");
    await act(async () => {
      fireEvent.click(within(row).getByText("FAILED"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await findByTestId("outcome-error")).toBeTruthy();
  });
});
