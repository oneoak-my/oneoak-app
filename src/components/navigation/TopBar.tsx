'use client'

import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/components/ThemeProvider'

export default function TopBar() {
  const [user, setUser] = useState<User | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const { theme, setTheme } = useTheme()
  const THEMES: { key: Theme; icon: string; title: string }[] = [
    { key: 'dark', icon: '🌑', title: 'Dark Gold' },
    { key: 'warm', icon: '🌤', title: 'Warm Neutral' },
  ]

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const displayName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? ''

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 border-b border-[#332c20] bg-[#141210]/95 backdrop-blur-sm max-w-2xl mx-auto">
      <div className="flex items-center">
        <Image
          src="/logo.png"
          alt="One Oak"
          height={50}
          width={160}
          priority
          style={{
            width: '160px',
            height: 'auto',
            objectFit: 'contain',
            filter: theme === 'dark' ? 'brightness(0) invert(1)' : 'none',
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        {displayName && (
          <span className="text-xs text-[#7c6f54] hidden sm:block">{displayName}</span>
        )}

        {/* Theme toggle — 3 pills */}
        <div className="flex items-center rounded-lg border border-[#332c20] overflow-hidden">
          {THEMES.map(({ key, icon, title }) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              title={title}
              className={`px-2 py-1.5 text-sm transition-colors ${
                theme === key
                  ? 'bg-gold-500/20 text-gold-400'
                  : 'text-[#5c5040] hover:text-[#7c6f54] hover:bg-[#262018]'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#7c6f54] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          <LogOut size={15} />
          <span className="text-xs hidden sm:block">Sign out</span>
        </button>
      </div>
    </header>
  )
}
