'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, User, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || !name.trim()) return
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: name.trim() },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Supabase may auto-confirm or require email verification
    // Try signing in immediately after signup
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (signInError) {
      // Email confirmation required
      setSuccess(true)
      setLoading(false)
      return
    }

    router.push('/')
  }

  if (success) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] p-8 text-center shadow-2xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-4">
            <span className="text-emerald-400 text-xl">✓</span>
          </div>
          <h2 className="text-base font-semibold text-[#f5f0e8] mb-2">Check your email</h2>
          <p className="text-xs text-[#7c6f54] mb-5">
            We sent a confirmation link to <span className="text-[#a89d84]">{email}</span>.
            Click it to activate your account, then come back to sign in.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0e0c08] font-semibold text-sm transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/30 mb-4">
          <span className="text-gold-400 text-3xl font-bold leading-none">⬡</span>
        </div>
        <h1 className="text-2xl font-bold text-[#f5f0e8]">One Oak</h1>
        <p className="text-sm text-[#7c6f54] mt-1">Property Management</p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-[#f5f0e8] mb-5">Create an account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#a89d84]">Full Name</label>
            <div className="relative flex items-center">
              <User size={15} className="absolute left-3 text-[#5c5040] pointer-events-none" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Elleen"
                required
                autoComplete="name"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#332c20] bg-[#262018] text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#a89d84]">Email</label>
            <div className="relative flex items-center">
              <Mail size={15} className="absolute left-3 text-[#5c5040] pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#332c20] bg-[#262018] text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#a89d84]">Password</label>
            <div className="relative flex items-center">
              <Lock size={15} className="absolute left-3 text-[#5c5040] pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                autoComplete="new-password"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-[#332c20] bg-[#262018] text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-[#5c5040] hover:text-[#a89d84] transition-colors"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email || !password || !name}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0e0c08] font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>

      {/* Login link */}
      <p className="text-center text-xs text-[#5c5040] mt-5">
        Already have an account?{' '}
        <Link href="/login" className="text-gold-400 hover:text-gold-300 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
