'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, FileSignature, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createAgreement, deleteAgreement, duplicateAgreement, isMissingTable, listAgreements } from '@/lib/tenancy/api'
import { getTemplate } from '@/lib/tenancy/templates'
import type { TenancyAgreementRow } from '@/lib/tenancy/types'

function fmtUpdated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AgreementDraftsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<TenancyAgreementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listAgreements())
    } catch (e) {
      setError(isMissingTable(e)
        ? 'The tenancy_agreements table does not exist yet. Run the tenancy agreement SQL in Supabase, then reload.'
        : `Could not load drafts: ${(e as Error)?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleNew() {
    setBusy('new')
    try {
      const row = await createAgreement()
      router.push(`/tenancy-admin/agreements/${row.id}`)
    } catch (e) {
      setError(isMissingTable(e)
        ? 'The tenancy_agreements table does not exist yet. Run the tenancy agreement SQL in Supabase.'
        : `Could not create a draft: ${(e as Error)?.message ?? e}`)
      setBusy(null)
    }
  }

  async function handleDuplicate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(id)
    try {
      await duplicateAgreement(id)
      await load()
    } catch (err) {
      setError(`Could not duplicate: ${(err as Error)?.message ?? err}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(row: TenancyAgreementRow, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${row.title || 'Untitled draft'}"? This cannot be undone.`)) return
    setBusy(row.id)
    try {
      await deleteAgreement(row.id)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (err) {
      setError(`Could not delete: ${(err as Error)?.message ?? err}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0c08] pb-24">
      <div className="sticky top-0 z-30 bg-[#0e0c08]/95 backdrop-blur border-b border-[#1e1a14] px-4 py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/tenancy-admin" aria-label="Back to Tenancy Admin" className="shrink-0 p-1.5 -ml-1.5 rounded-lg text-[#7c6f54] hover:text-[#f5f0e8] hover:bg-[#262018]">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl font-bold text-[#f5f0e8] truncate">Tenancy Agreements</h1>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} loading={busy === 'new'} onClick={handleNew}>
          New draft
        </Button>
      </div>

      <div className="px-4 pt-4 space-y-3 max-w-2xl mx-auto">
        {error && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/20 px-3 py-2.5 text-xs text-orange-300">{error}</div>
        )}
        {loading && <div className="text-center text-[#7c6f54] py-16 text-sm">Loading…</div>}
        {!loading && !error && rows.length === 0 && (
          <EmptyState
            icon={<FileSignature size={36} className="text-[#7c6f54]" />}
            title="No tenancy agreement drafts yet"
            description={'Tap "+ New draft" to start one.'}
          />
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/tenancy-admin/agreements/${row.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/tenancy-admin/agreements/${row.id}`) }}
            style={{ touchAction: 'manipulation', minHeight: '64px' }}
            className="w-full text-left bg-[#1e1a14] border border-[#332c20] rounded-2xl px-4 py-3.5 hover:border-[#3d3628] transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[#f5f0e8] font-medium text-sm leading-snug truncate">{row.title || 'Untitled draft'}</p>
                <p className="text-[#7c6f54] text-xs mt-1 truncate">
                  {getTemplate(row.template_id).label} · Updated {fmtUpdated(row.updated_at)}
                </p>
              </div>
              <button
                onClick={(e) => handleDuplicate(row.id, e)}
                disabled={busy === row.id}
                title="Duplicate"
                aria-label="Duplicate draft"
                style={{ minHeight: '36px', minWidth: '36px', touchAction: 'manipulation' }}
                className="shrink-0 flex items-center justify-center rounded-lg hover:bg-[#262018] text-[#7c6f54] hover:text-[#f5f0e8] transition-colors disabled:opacity-50"
              >
                <Copy size={15} />
              </button>
              <button
                onClick={(e) => handleDelete(row, e)}
                disabled={busy === row.id}
                title="Delete"
                aria-label="Delete draft"
                style={{ minHeight: '36px', minWidth: '36px', touchAction: 'manipulation' }}
                className="shrink-0 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-[#7c6f54] hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
