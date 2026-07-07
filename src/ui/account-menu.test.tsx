// @vitest-environment jsdom
// P2-T6 · AccountMenu — the TopBar widget. Three states: LOADING / GUEST / SIGNED IN. Mocks
// useSession directly (unit-level — the hook itself is covered by src/lib/useSession.test.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { AccountMenu } from "./AccountMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/useSession", () => ({ useSession: useSessionMock }));

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth: { signOut: signOutMock } }),
}));

beforeEach(() => {
  signOutMock.mockClear();
});

afterEach(cleanup);

describe("AccountMenu", () => {
  it("LOADING — shows a quiet placeholder while the session resolves", () => {
    useSessionMock.mockReturnValue({ user: null, loading: true });
    const { getByTestId, queryByTestId } = render(<AccountMenu />);
    expect(getByTestId("account-menu-loading")).toBeTruthy();
    expect(queryByTestId("account-menu-guest")).toBeNull();
    expect(queryByTestId("account-menu-user")).toBeNull();
  });

  it("GUEST — shows 'Sign in to save' linking to /login", () => {
    useSessionMock.mockReturnValue({ user: null, loading: false });
    const { getByTestId } = render(<AccountMenu />);
    const link = getByTestId("account-menu-guest");
    expect(link.textContent).toMatch(/sign in to save/i);
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("SIGNED IN — shows the email, Account/Connections links, and Sign out", () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    const { getByTestId, getByText } = render(<AccountMenu />);
    const widget = getByTestId("account-menu-user");
    expect(widget.textContent).toContain("a@b.com");
    expect(getByText("Account").getAttribute("href")).toBe("/account");
    expect(getByText("Connections").getAttribute("href")).toBe("/account/connections");
    expect(getByText("Sign out")).toBeTruthy();
  });

  it("SIGNED IN — Sign out calls supabase auth.signOut", async () => {
    useSessionMock.mockReturnValue({ user: { id: "u-1", email: "a@b.com" }, loading: false });
    const { getByText } = render(<AccountMenu />);
    await act(async () => {
      fireEvent.click(getByText("Sign out"));
      await Promise.resolve(); // let the click handler's async body (await signOut()) settle
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the user id when no email is present", () => {
    useSessionMock.mockReturnValue({ user: { id: "u-no-email", email: null }, loading: false });
    const { getByTestId } = render(<AccountMenu />);
    expect(getByTestId("account-menu-user").textContent).toContain("u-no-email");
  });
});
