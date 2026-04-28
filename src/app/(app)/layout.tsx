'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TopBar from '@/components/navigation/TopBar'
import BottomNav from '@/components/navigation/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = '/login'
      } else {
        setChecking(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.href = '/login'
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-gold-400 text-4xl animate-pulse">⬡</span>
          <p className="text-xs text-[#5c5040]">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh max-w-2xl mx-auto relative">
      <TopBar />
      <main className="flex-1 pb-20 pt-14">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
