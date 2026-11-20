'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AgreementEditor from '@/components/tenancy/AgreementEditor'
import { getAgreement, isMissingTable, listUnitsLite, type UnitLite } from '@/lib/tenancy/api'
import type { TenancyAgreementRow } from '@/lib/tenancy/types'

export default function AgreementDraftPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [row, setRow] = useState<TenancyAgreementRow | null>(null)
  const [units, setUnits] = useState<UnitLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const [r, us] = await Promise.all([getAgreement(id), listUnitsLite().catch(() => [] as UnitLite[])])
        if (cancelled) return
        if (!r) setError('This draft was not found. It may have been deleted.')
        setRow(r)
        setUnits(us)
      } catch (e) {
        if (!cancelled) {
          setError(isMissingTable(e)
            ? 'The tenancy_agreements table does not exist yet. Run the tenancy agreement SQL in Supabase.'
            : `Could not open the draft: ${(e as Error)?.message ?? e}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  return (
    <div className="min-h-screen bg-[#0e0c08] pb-24">
      <div className="sticky top-0 z-30 bg-[#0e0c08]/95 backdrop-blur border-b border-[#1e1a14] px-4 py-4 flex items-center gap-2">
        <Link href="/tenancy-admin/agreements" aria-label="Back to drafts" className="shrink-0 p-1.5 -ml-1.5 rounded-lg text-[#7c6f54] hover:text-[#f5f0e8] hover:bg-[#262018]">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-bold text-[#f5f0e8] truncate">Tenancy Agreement</h1>
      </div>
      {loading && <div className="text-center text-[#7c6f54] py-16 text-sm">Loading…</div>}
      {error && (
        <div className="px-4 pt-4 max-w-2xl mx-auto">
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/20 px-3 py-2.5 text-xs text-orange-300">{error}</div>
        </div>
      )}
      {row && <AgreementEditor key={row.id} row={row} units={units} />}
    </div>
  )
}
