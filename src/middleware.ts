import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth is enforced client-side in (app)/layout.tsx.
// This middleware is intentionally a passthrough — the Supabase JS client
// stores sessions in localStorage, not cookies, so server-side checks
// always see "no session" and cause redirect loops.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],  // match nothing — middleware effectively disabled
}
