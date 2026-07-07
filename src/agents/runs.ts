// Run rate/cost guard + usage logging (plan Task 10). Server-only (uses the admin
// Supabase client, which bypasses RLS to count/log across a user's own `runs` rows —
// the same rows RLS already scopes to that user, so this is a convenience, not a
// privilege escalation). Consumed by src/app/api/gather/route.ts: `checkRunAllowed`
// gates BEFORE any paid call; `logRun` records the outcome after.
//
// Fail-open (hard constraint): if the count query itself errors (unreachable DB,
// misconfigured admin key, etc.), `checkRunAllowed` ALLOWS the run rather than
// blocking the product on an infra hiccup. The caps only bite when we can actually
// prove the caller is over them.
import { createAdminSupabase } from "@/lib/supabase/admin";

const HOURLY_CAP = 30;
const MONTHLY_CAP = 500;
const HOUR_MS = 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * HOUR_MS;

export interface RunAllowedResult {
  allowed: boolean;
  reason?: string;
}

interface CountResult {
  count: number | null;
  error: unknown;
}

async function countSince(
  admin: ReturnType<typeof createAdminSupabase>,
  userId: string,
  sinceISO: string,
): Promise<CountResult> {
  const { count, error } = await admin
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceISO);
  return { count: count ?? null, error };
}

/** Counts `runs` in the last hour/month for `userId` against the 30/hr, 500/mo caps. */
export async function checkRunAllowed(userId: string): Promise<RunAllowedResult> {
  try {
    const admin = createAdminSupabase();
    const now = Date.now();
    const hourAgo = new Date(now - HOUR_MS).toISOString();
    const monthAgo = new Date(now - MONTH_MS).toISOString();

    const [hourly, monthly] = await Promise.all([
      countSince(admin, userId, hourAgo),
      countSince(admin, userId, monthAgo),
    ]);

    // Fail-open: an errored count can't prove the caller is over the cap.
    if (hourly.error || monthly.error) return { allowed: true };

    if ((hourly.count ?? 0) >= HOURLY_CAP) {
      return { allowed: false, reason: `hourly run limit reached (${HOURLY_CAP}/hr) — try again later` };
    }
    if ((monthly.count ?? 0) >= MONTHLY_CAP) {
      return { allowed: false, reason: `monthly run limit reached (${MONTHLY_CAP}/mo) — try again next month` };
    }
    return { allowed: true };
  } catch {
    // Admin client unavailable / unexpected throw — fail open.
    return { allowed: true };
  }
}

/** Best-effort usage log; never throws (a logging failure must not break a gather run). */
export async function logRun(
  userId: string,
  kind: string,
  source: "live" | "fixture",
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("runs").insert({
      user_id: userId,
      kind,
      source,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
  } catch {
    // Best-effort — logging failures must never break the caller's gather run.
  }
}
