import { describe, it, expect } from "vitest";
import { createAdminSupabase } from "./admin";

describe("supabase clients", () => {
  it("admin client constructs from env without throwing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://x.supabase.co";
    process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
    expect(() => createAdminSupabase()).not.toThrow();
  });
});
