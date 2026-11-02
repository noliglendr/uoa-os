import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can open without a session.
const PUBLIC_PATHS = ["/login"];
// Pages a signed-in user can open before finishing the second factor (MFA).
const MFA_PATHS = ["/mfa"];

function startsWithAny(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Refreshes the Supabase session cookie on every request and sends the user
// to the right step: login, then MFA, then the app.
// This is an optimistic check only. Real access control is row-level security
// in the database.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not add code between createServerClient and getClaims():
  // getClaims() is what refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!claims) {
    return startsWithAny(pathname, PUBLIC_PATHS) ? response : redirectTo("/login");
  }

  // Signed in with a password only (aal1): every page except MFA setup and
  // verification is blocked until the second factor is done (aal2).
  if (claims.aal !== "aal2") {
    return startsWithAny(pathname, MFA_PATHS) ? response : redirectTo("/mfa");
  }

  if (startsWithAny(pathname, PUBLIC_PATHS) || startsWithAny(pathname, MFA_PATHS)) {
    return redirectTo("/");
  }

  return response;
}
