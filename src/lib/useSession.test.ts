// @vitest-environment jsdom
// P2-T6 · useSession — the client session hook. Verifies the guest/user backend switch
// (setLibraryBackend), the one-time guest-library import offer, and that a broken/misconfigured
// Supabase client (e.g. missing NEXT_PUBLIC_* env vars) degrades to guest mode rather than crashing.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { getLibraryBackend } from "@/lib/library";

const { createBrowserSupabaseMock } = vi.hoisted(() => ({ createBrowserSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabase: createBrowserSupabaseMock }));

const { importGuestLibraryIntoAccountMock } = vi.hoisted(() => ({
  importGuestLibraryIntoAccountMock: vi.fn(async () => ({ imported: 0, skipped: 0 })),
}));
vi.mock("@/lib/library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/library")>();
  return { ...actual, importGuestLibraryIntoAccount: importGuestLibraryIntoAccountMock };
});

type FakeUser = { id: string; email: string };

function makeFakeClient(initialUser: FakeUser | null) {
  let authChangeCb: ((event: string, session: { user: FakeUser } | null) => void) | null = null;
  const unsubscribe = vi.fn();
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: initialUser } })),
      onAuthStateChange: vi.fn((cb: typeof authChangeCb) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };
  return {
    client,
    unsubscribe,
    fireAuthChange: (user: FakeUser | null) => authChangeCb?.("SIGNED_IN", user ? { user } : null),
  };
}

beforeEach(() => {
  createBrowserSupabaseMock.mockReset();
  importGuestLibraryIntoAccountMock.mockClear();
  window.localStorage.clear();
});

describe("useSession — guest/user backend switch", () => {
  it("starts loading, then resolves to guest (no user) and sets the guest library backend", async () => {
    const { client } = makeFakeClient(null);
    createBrowserSupabaseMock.mockReturnValue(client);

    const { useSession } = await import("./useSession");
    const { result } = renderHook(() => useSession());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(getLibraryBackend()).toBe("guest");
  });

  it("resolves to the signed-in user immediately and sets the user backend", async () => {
    const user: FakeUser = { id: "u-1", email: "a@b.com" };
    const { client } = makeFakeClient(user);
    createBrowserSupabaseMock.mockReturnValue(client);

    const { useSession } = await import("./useSession");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(user);
    expect(getLibraryBackend()).toBe("user");
  });

  it("an auth-state change flips guest → user, and offers the one-time import exactly once", async () => {
    const { client, fireAuthChange } = makeFakeClient(null);
    createBrowserSupabaseMock.mockReturnValue(client);

    const { useSession } = await import("./useSession");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getLibraryBackend()).toBe("guest");

    fireAuthChange({ id: "u-2", email: "c@d.com" });
    await waitFor(() => expect(result.current.user).toEqual({ id: "u-2", email: "c@d.com" }));
    expect(getLibraryBackend()).toBe("user");
    expect(importGuestLibraryIntoAccountMock).toHaveBeenCalledTimes(1);

    // A second SIGNED_IN event (e.g. a token refresh) must NOT re-offer the import.
    fireAuthChange({ id: "u-2", email: "c@d.com" });
    await waitFor(() => expect(importGuestLibraryIntoAccountMock).toHaveBeenCalledTimes(1));
  });

  it("an auth-state change to null flips back to guest", async () => {
    const user: FakeUser = { id: "u-3", email: "e@f.com" };
    const { client, fireAuthChange } = makeFakeClient(user);
    createBrowserSupabaseMock.mockReturnValue(client);

    const { useSession } = await import("./useSession");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(getLibraryBackend()).toBe("user"));

    fireAuthChange(null);
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(getLibraryBackend()).toBe("guest");
  });
});

describe("useSession — guest mode keeps working when Supabase is unreachable", () => {
  it("a synchronously-throwing client (e.g. missing NEXT_PUBLIC_* env vars) degrades to guest, never crashes", async () => {
    createBrowserSupabaseMock.mockImplementation(() => {
      throw new Error("Your project's URL and API key are required");
    });

    const { useSession } = await import("./useSession");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(getLibraryBackend()).toBe("guest");
  });
});
