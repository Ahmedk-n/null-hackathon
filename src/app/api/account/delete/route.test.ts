// P5-T14 · POST /api/account/delete. Confirms the two hard privacy/security requirements:
//   (a) unauthenticated → 401 (never touches the admin client).
//   (b) authenticated → the id passed to the admin delete comes ONLY from the RLS-bound session
//       (createServerSupabase().auth.getUser()), never from anything client-supplied — there's no
//       request body to read an id from in the first place, but this test pins that the session
//       user id specifically is what reaches admin.auth.admin.deleteUser.
// Never a 500 on a Supabase error (catch → clean error json).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createServerSupabaseMock, deleteUserMock } = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  deleteUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: createServerSupabaseMock }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(() => ({ auth: { admin: { deleteUser: deleteUserMock } } })),
}));

import { POST } from "./route";

function supabaseAs(userId: string | null) {
  return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } };
}

beforeEach(() => {
  createServerSupabaseMock.mockReset();
  deleteUserMock.mockReset();
});

describe("POST /api/account/delete", () => {
  it("401s when unauthenticated and never calls the admin delete", async () => {
    createServerSupabaseMock.mockResolvedValue(supabaseAs(null));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("deletes the SESSION user's own account (id comes from auth.getUser, never a body)", async () => {
    createServerSupabaseMock.mockResolvedValue(supabaseAs("u-1"));
    deleteUserMock.mockResolvedValue({ error: null });
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(deleteUserMock).toHaveBeenCalledWith("u-1");
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
  });

  it("a different session (u-2) deletes u-2, never some other id", async () => {
    createServerSupabaseMock.mockResolvedValue(supabaseAs("u-2"));
    deleteUserMock.mockResolvedValue({ error: null });
    await POST();
    expect(deleteUserMock).toHaveBeenCalledWith("u-2");
  });

  it("never throws a 500 on a Supabase error — returns a clean error json", async () => {
    createServerSupabaseMock.mockResolvedValue(supabaseAs("u-1"));
    deleteUserMock.mockResolvedValue({ error: { message: "admin api down" } });
    const res = await POST();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("admin api down");
  });

  it("never throws even if createServerSupabase itself rejects", async () => {
    createServerSupabaseMock.mockRejectedValue(new Error("cookies unavailable"));
    await expect(POST()).resolves.toBeInstanceOf(Response);
  });
});
