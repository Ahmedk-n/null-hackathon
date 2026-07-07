// Test-only helper (not a *.test.ts, so vitest never collects it as a suite) — a minimal
// chainable fake of the Supabase query builder shared by src/app/api/decisions/route.test.ts and
// src/app/api/decisions/[id]/route.test.ts. Every chain method (select/eq/order/limit/insert/
// update/delete) returns itself; the chain is directly awaitable (implements `then`, matching
// PostgrestFilterBuilder) AND exposes `.single()`/`.maybeSingle()` as terminal calls — whichever
// the route under test uses.
export interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

export function makeQuery(result: FakeResult) {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    insert: () => q,
    update: () => q,
    delete: () => q,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (r: FakeResult) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

export function makeSupabase(opts: {
  userId?: string | null;
  from: (table: string, callIndex: number) => ReturnType<typeof makeQuery>;
}) {
  let calls = 0;
  return {
    auth: {
      getUser: async () => ({
        data: { user: opts.userId ? { id: opts.userId } : null },
      }),
    },
    from: (table: string) => opts.from(table, calls++),
  };
}
