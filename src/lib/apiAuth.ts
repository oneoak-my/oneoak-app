import { NextResponse } from 'next/server'
import { createClient, type User } from '@supabase/supabase-js'

// Server-side check for API routes: the caller must send its Supabase session
// token as "Authorization: Bearer <access_token>".
export async function requireUser(request: Request): Promise<User | NextResponse> {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  if (!token) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }

  const server = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await server.auth.getUser(token)
  if (error || !data.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }
  return data.user
}
