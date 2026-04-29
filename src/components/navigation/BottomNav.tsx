'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Building2, CalendarDays, Receipt } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/units', label: 'Units', icon: Building2 },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/bills', label: 'Bills', icon: Receipt },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 max-w-2xl mx-auto border-t border-[#332c20] bg-[#141210]/95 backdrop-blur-sm safe-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{ minHeight: '48px', minWidth: '64px' }}
              className={`flex flex-col items-center justify-center gap-0.5 px-5 py-2 rounded-xl transition-colors touch-manipulation ${
                isActive
                  ? 'text-gold-400'
                  : 'text-[#7c6f54] hover:text-[#a89d84]'
              }`}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
                className={isActive ? 'text-gold-400' : ''}
              />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
