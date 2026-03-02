import { NextRequest, NextResponse } from "next/server";

const COOKIE = "sq_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(COOKIE);

  const isLoginPage = pathname === "/host/login";

  // Redirect logged-in users away from the login page
  if (isLoginPage && session) {
    return NextResponse.redirect(new URL("/host", request.url));
  }

  // Protect /host/* (except /host/login) and /admin/*
  const isProtected =
    (pathname.startsWith("/host") && !isLoginPage) ||
    pathname.startsWith("/admin");

  if (isProtected && !session) {
    const loginUrl = new URL("/host/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/host/:path*", "/admin/:path*"],
};
