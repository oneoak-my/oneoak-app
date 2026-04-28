'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import { getRecords } from '@/lib/api'
import type { PropertyRecord, RecordType, Unit } from '@/lib/types'
import { RECORD_TYPE_LABELS, RECORD_STATUS_COLORS } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import Badge, { statusBadge } from '@/components/ui/Badge'

type FlatRecord = PropertyRecord & { unit: Unit }

function getPageTitle(type?: string | null, report?: string | null, status?: string | null): string {
  if (type === 'checkin' && report === 'pending') return 'Pending Check-in Reports'
  if (type === 'checkout' && report === 'pending') return 'Pending Check-out Reports'
  if (type === 'maintenance' && status === 'pending') return 'Pending Maintenance'
  if (type === 'checkin') return 'Check-in Records'
  if (type === 'checkout') return 'Check-out Records'
  if (type === 'maintenance') return 'Maintenance Records'
  return 'All Records'
}

function RecordsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const type = searchParams.get('type') as RecordType | null
  const report = searchParams.get('report')
  const status = searchParams.get('status')

  const [records, setRecords] = useState<FlatRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getRecords({
      type: type ?? undefined,
      reportPending: report === 'pending',
      statusPending: !report && status === 'pending',
    })
      .then((data) => setRecords(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [type, report, status])

  const title = getPageTitle(type, report, status)

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm cursor-pointer select-none"
          style={{
            minWidth: '80px',
            minHeight: '48px',
            position: 'static',
            transform: 'none',
            marginLeft: '0',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-[#f5f0e8]">{title}</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-sm text-[#5c5040]">No records found.</div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <RecordListItem key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecordListItem({ record }: { record: FlatRecord }) {
  const typeBadge = statusBadge(record.type)
  const recStatus = record.record_status ?? 'Open'
  const statusColor = RECORD_STATUS_COLORS[recStatus] ?? RECORD_STATUS_COLORS['Open']
  const dateLabel = record.type === 'checkin' ? 'Move-in' : record.type === 'checkout' ? 'Move-out' : 'Date'
  const dateValue = record.type === 'checkin' ? (record.move_in_date ?? record.date) : record.date

  return (
    <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#f5f0e8] text-sm">{record.unit?.unit_number}</span>
            <span className="text-xs text-[#5c5040]">{record.unit?.building}</span>
            <Badge variant={typeBadge.variant}>{RECORD_TYPE_LABELS[record.type]}</Badge>
          </div>
          {record.tenant_name && (
            <p className="text-xs text-[#7c6f54] mt-0.5 truncate">{record.tenant_name}</p>
          )}
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
          {recStatus}
        </span>
      </div>

      {dateValue && (
        <p className="text-xs text-[#7c6f54]">{dateLabel}: {formatDate(dateValue)}</p>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <Link
          href={`/records/${record.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/15 text-gold-400 text-xs font-semibold hover:bg-gold-500/25 transition-colors"
        >
          <FileText size={12} />
          Generate Report
        </Link>
        <Link
          href={`/records/${record.id}`}
          className="flex items-center gap-1 text-xs text-[#7c6f54] hover:text-[#a89d84] transition-colors"
        >
          View Record <ChevronRight size={12} />
        </Link>
      </div>
    </div>
  )
}

export default function RecordsPage() {
  return (
    <Suspense fallback={
      <div className="px-4 py-5 space-y-4">
        <div className="h-8 w-48 rounded-lg bg-[#1e1a14] animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
        ))}
      </div>
    }>
      <RecordsContent />
    </Suspense>
  )
}
