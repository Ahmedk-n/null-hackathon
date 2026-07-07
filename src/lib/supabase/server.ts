import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client bound to the request cookies (App Router). Uses the publishable key +
// the user's session cookie, so RLS applies as that user.
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — safe to ignore; middleware refreshes.
          }
        },
      },
    },
  );
}
