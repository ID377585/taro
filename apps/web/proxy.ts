import { auth } from "@/auth";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard"];
const authPages = ["/login"];

export default auth(request => {
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix));
  const isAuthPage = authPages.some(prefix => pathname.startsWith(prefix));
  const isLoggedIn = Boolean(request.auth?.user);

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
