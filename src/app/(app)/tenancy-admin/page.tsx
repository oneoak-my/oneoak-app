'use client'

import Link from 'next/link'
import { FileSignature, ClipboardList, Camera, ChevronRight } from 'lucide-react'

const CARDS = [
  {
    href: '/tenancy-admin/agreements',
    title: 'Tenancy Agreement',
    description: 'Draft a tenancy agreement and download it as PDF or Word.',
    icon: FileSignature,
  },
  {
    href: '/inventory',
    title: 'Inventory List',
    description: 'Tick the items in each area and export the inventory list.',
    icon: ClipboardList,
  },
  {
    href: '/inventory?view=photos',
    title: 'Inventory Photos',
    description: 'Upload and arrange the photos for an inventory.',
    icon: Camera,
  },
]

export default function TenancyAdminPage() {
  return (
    <div className="min-h-screen bg-[#0e0c08] pb-24">
      <div className="sticky top-0 z-30 bg-[#0e0c08]/95 backdrop-blur border-b border-[#1e1a14] px-4 py-4">
        <h1 className="text-xl font-bold text-[#f5f0e8]">Tenancy Admin</h1>
      </div>
      <div className="px-4 pt-4 space-y-3 max-w-2xl mx-auto">
        {CARDS.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            style={{ touchAction: 'manipulation', minHeight: '72px' }}
            className="flex items-center gap-3 w-full bg-[#1e1a14] border border-[#332c20] rounded-2xl px-4 py-4 hover:border-[#3d3628] transition-colors"
          >
            <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-[#262018] text-gold-400">
              <Icon size={20} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[#f5f0e8] font-medium text-sm">{title}</span>
              <span className="block text-[#7c6f54] text-xs mt-0.5">{description}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-[#7c6f54]" />
          </Link>
        ))}
      </div>
    </div>
  )
}
