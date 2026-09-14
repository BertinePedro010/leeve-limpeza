import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll: ((cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }) satisfies SetAllCookies,
      },
    }
  );
  await supabase.auth.getUser();
  return response;
}

// /api/** is excluded here on purpose. This middleware's only job is the
// getUser() side effect that refreshes/rotates the session cookie - it never
// blocks or redirects on failure, so it enforces nothing. Every API route
// already calls requireAuth() (lib/authz.ts), which does its own getUser()
// via a Route Handler-scoped Supabase client - and unlike this middleware,
// that client CAN write rotated cookies back onto the response (Route
// Handlers support cookies().set(); this middleware's refresh is only load-
// bearing for Server Component pages like /app, which cannot set cookies
// themselves). Running it again for every /api/** request was a second,
// fully redundant network call to Supabase Auth per request with no security
// benefit - requireAuth() remains the sole, authoritative check for API
// routes, unchanged.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"] };
