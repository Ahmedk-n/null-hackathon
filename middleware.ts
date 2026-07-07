import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Guest-mode invariant: with no Supabase env the app must still serve every route.
  // `createServerClient` throws synchronously on a falsy url/key, so short-circuit here
  // (and belt-and-suspenders try/catch the whole block) rather than 500 every request.
  if (!url || !anonKey) return response;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Touch the user to trigger refresh; never throw for guests.
    await supabase.auth.getUser().catch(() => {});
  } catch {
    // Malformed env / SDK construction failure — degrade to guest, never 500.
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/gather).*)"],
};
