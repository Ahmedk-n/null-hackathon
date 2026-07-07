// @vitest-environment jsdom
// P5-T14 · /account — LOADING / GUEST (empty) / SIGNED IN states, plus the two privacy actions:
// Export (download decisions JSON via /api/decisions) and Delete account (confirm → POST
// /api/account/delete). Mocks useSession + the browser Supabase client directly (unit-level —
// each hook/route has its own test); fetch is mocked per-test.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import AccountPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/useSession", () => ({ useSession: useSessionMock }));

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth: { signOut: signOutMock } }),
}));

// jsdom doesn't implement createObjectURL/revokeObjectURL — the Export flow only needs them to
// exist and not throw; the actual blob content isn't observable through the DOM anyway.
beforeEach(() => {
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => "blob:fake");
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  signOutMock.mockClear();
  vi.stubGlobal("fetch", vi.fn());
  delete (window as { location?: unknown }).location;
  (window as { location: { href: string } }).location = { href: "" } as { href: string };
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

  it("SIGNED IN — shows the email and the Export / Delete actions", () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    const { getByTestId, getByText } = render(<AccountPage />);
    const panel = getByTestId("account-signed-in");
    expect(panel.textContent).toContain("a@b.com");
    expect(getByText("Export decisions")).toBeTruthy();
    expect(getByText("Delete account")).toBeTruthy();
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
    const { getByText, queryByText } = render(<AccountPage />);
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
