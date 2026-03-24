import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/register', '/auth/setup-account'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths, static assets, and Next.js internals
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic || pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Check for access token in localStorage isn't possible server-side,
  // so we use a lightweight cookie as a session hint.
  // The real auth check happens client-side in AuthProvider.
  // This middleware provides a fast redirect for users who haven't logged in at all.
  const hasSession = request.cookies.get('float0_has_session');
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
