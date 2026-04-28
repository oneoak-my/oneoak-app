'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'

export default function LoginPage() {
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Hard redirect so the new session is picked up cleanly
    window.location.href = '/'
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex justify-center mb-10">
        <Image
          src="/logo.png"
          alt="One Oak"
          height={75}
          width={240}
          priority
          style={{
            width: '240px',
            height: 'auto',
            objectFit: 'contain',
            filter: theme === 'dark' ? 'brightness(0) invert(1)' : 'none',
          }}
        />
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-[#f5f0e8] mb-5">Sign in to your account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#a89d84]">Password</label>
            <div className="relative flex items-center">
              <Lock size={15} className="absolute left-3 text-[#5c5040] pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
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

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0e0c08] font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-[#5c5040] mt-5">
        Need an account?{' '}
        <Link href="/register" className="text-gold-400 hover:text-gold-300 font-medium">
          Register here
        </Link>
      </p>
    </div>
  )
}
