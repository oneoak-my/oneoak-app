'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { CalendarDays, ArrowRight } from 'lucide-react'
import { getUpcomingCheckins, updateRecord } from '@/lib/api'
import type { PropertyRecord, Unit, Task } from '@/lib/types'
import { RECORD_STATUS_COLORS, LISTER_OPTIONS } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type CheckinRecord = PropertyRecord & { unit: Unit; tasks: Task[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

function daysUntilDate(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function buildCalendarUrl(record: CheckinRecord): string {
  const rawDate = record.move_in_date ?? record.date
  const dateStr = rawDate.replace(/-/g, '')
  const timeStr = record.appointment_time ?? '10:00:00'
  const [h, m] = timeStr.split(':').map(Number)
  const startHH = String(h).padStart(2, '0')
  const startMM = String(m).padStart(2, '0')
  const endHH = String((h + 1) % 24).padStart(2, '0')
  const start = `${dateStr}T${startHH}${startMM}00`
  const end   = `${dateStr}T${endHH}${startMM}00`
  const unit  = record.unit
  const title   = encodeURIComponent(`Check-in: ${unit?.unit_number ?? ''} - ${record.tenant_name ?? ''}`)
  const details = encodeURIComponent(`Unit: ${unit?.unit_number ?? ''} | Tenant: ${record.tenant_name ?? ''} | Lister: ${unit?.lister ?? '—'}`)
  const location = encodeURIComponent(unit?.building ?? '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`
}

function yyyyMM(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// ── Select style shared ───────────────────────────────────────────────────────

const selectCls =
  'rounded-lg bg-[#1e1a14] border border-[#332c20] text-xs text-[#a89d84] px-3 py-2 focus:outline-none focus:border-gold-500/60 appearance-none pr-7 cursor-pointer'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [records, setRecords] = useState<CheckinRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [monthFilter,  setMonthFilter]  = useState('all')
  const [listerFilter, setListerFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const load = useCallback(async () => {
    try {
      const data = await getUpcomingCheckins()
      setRecords(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => set.add(yyyyMM(r.move_in_date ?? r.date)))
    return Array.from(set).sort()
  }, [records])

  const visible = useMemo(() => {
    let result = [...records]
    if (monthFilter !== 'all') {
      result = result.filter((r) => yyyyMM(r.move_in_date ?? r.date) === monthFilter)
    }
    if (listerFilter !== 'all') {
      result = result.filter((r) => (r.unit?.lister ?? 'Others') === listerFilter)
    }
    result.sort((a, b) => {
      const da = a.move_in_date ?? a.date
      const db = b.move_in_date ?? b.date
      return sortOrder === 'asc' ? da.localeCompare(db) : db.localeCompare(da)
    })
    return result
  }, [records, monthFilter, listerFilter, sortOrder])

  return (
    <div className="py-5 space-y-4">
      <h1 className="text-lg font-bold text-[#f5f0e8] px-4">Check-in Schedule</h1>

      {/* Filters */}
      <div className="px-4 flex flex-wrap gap-2 items-center">
        {/* Month */}
        <div className="relative">
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectCls}>
            <option value="all">All Months</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>{monthLabel(ym)}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
        </div>

        {/* Lister */}
        <div className="relative">
          <select value={listerFilter} onChange={(e) => setListerFilter(e.target.value)} className={selectCls}>
            <option value="all">All Listers</option>
            {LISTER_OPTIONS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
        </div>

        {/* Sort */}
        <div className="relative">
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')} className={selectCls}>
            <option value="asc">Soonest first</option>
            <option value="desc">Latest first</option>
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
        </div>

        <span className="text-xs text-[#5c5040] ml-1">{visible.length} record{visible.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="px-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-sm text-[#5c5040]">
          No check-ins found for the selected filter
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-[#1e1a14]">
          <table className="w-full border-collapse text-sm" style={{ minWidth: '720px' }}>
            <thead>
              <tr className="border-b border-[#332c20] bg-[#0e0c08]">
                <th className="sticky left-0 z-10 bg-[#0e0c08] px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '130px' }}>
                  Move-in Date
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Unit</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider" style={{ minWidth: '120px' }}>Tenant</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '110px' }}>Appt Time</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '130px' }}>Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '70px' }}>Tasks</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '80px' }}>Lister</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((record) => (
                <ScheduleRow key={record.id} record={record} onSaved={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ScheduleRow({ record, onSaved }: { record: CheckinRecord; onSaved: () => void }) {
  const [editingTime, setEditingTime] = useState(false)
  const [timeValue, setTimeValue]     = useState(record.appointment_time?.slice(0, 5) ?? '')
  const [saving, setSaving]           = useState(false)

  const moveInDate = record.move_in_date ?? record.date
  const days       = daysUntilDate(moveInDate)
  const isUrgent   = days >= 0 && days <= 7

  const tasks          = record.tasks ?? []
  const completedCount = tasks.filter((t) => t.status === 'Completed').length
  const allDone        = tasks.length > 0 && completedCount === tasks.length
  const noneDone       = completedCount === 0

  const dotColor = allDone ? 'bg-emerald-500'
    : !noneDone ? 'bg-orange-500'
    : isUrgent  ? 'bg-red-500'
    : 'bg-[#3d3628]'

  const recStatus  = record.record_status ?? 'Open'
  const statusColor = RECORD_STATUS_COLORS[recStatus] ?? RECORD_STATUS_COLORS['Open']

  // Date cell display
  let dateNode: React.ReactNode
  if (days === 0) {
    dateNode = <span className="text-red-400 font-semibold">Today</span>
  } else if (days === 1) {
    dateNode = <span className="text-orange-400 font-semibold">Tomorrow</span>
  } else if (isUrgent) {
    dateNode = (
      <span className="text-red-400">
        {formatDate(moveInDate)}{' '}
        <span className="text-[9px] bg-red-500/20 border border-red-500/30 px-1 py-0.5 rounded font-bold tracking-wide">
          URGENT
        </span>
      </span>
    )
  } else {
    dateNode = <span className="text-[#f5f0e8]">{formatDate(moveInDate)}</span>
  }

  async function saveTime() {
    setSaving(true)
    try {
      await updateRecord(record.id, { appointment_time: timeValue || null })
      setEditingTime(false)
      onSaved()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const rowBg = isUrgent ? 'bg-red-500/[0.03]' : ''

  return (
    <tr className={`border-b border-[#1e1a14] hover:bg-[#1e1a14] transition-colors ${rowBg}`}>
      {/* Move-in Date — sticky */}
      <td
        className="sticky left-0 px-4 py-3 whitespace-nowrap text-xs"
        style={{ background: isUrgent ? 'rgb(10,5,3)' : '#0e0c08', zIndex: 1 }}
      >
        {dateNode}
      </td>

      {/* Unit */}
      <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-[#f5f0e8]">
        {record.unit?.unit_number}
      </td>

      {/* Tenant */}
      <td className="px-4 py-3 text-xs text-[#7c6f54] max-w-[140px] truncate">
        {record.tenant_name ?? '—'}
      </td>

      {/* Appt Time */}
      <td className="px-4 py-3 whitespace-nowrap text-xs">
        {editingTime ? (
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="rounded bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] px-1.5 py-1 focus:outline-none focus:border-gold-500/60 w-28"
            />
            <button
              onClick={saveTime}
              disabled={saving}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
            >
              {saving ? '…' : '✓'}
            </button>
            <button
              onClick={() => { setEditingTime(false); setTimeValue(record.appointment_time?.slice(0, 5) ?? '') }}
              className="text-[11px] text-[#5c5040] hover:text-[#7c6f54]"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingTime(true)}
            className="text-[#a89d84] hover:text-gold-400 underline underline-offset-2 transition-colors"
          >
            {formatTime(record.appointment_time)}
          </button>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
          {recStatus}
        </span>
      </td>

      {/* Tasks */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs text-[#a89d84]">
            {tasks.length > 0 ? `${completedCount}/${tasks.length}` : '—'}
          </span>
        </div>
      </td>

      {/* Lister */}
      <td className="px-4 py-3 whitespace-nowrap text-xs text-[#5c5040]">
        {record.unit?.lister ?? '—'}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <a
            href={buildCalendarUrl(record)}
            target="_blank"
            rel="noopener noreferrer"
            title="Add to Google Calendar"
            className="p-1.5 rounded-lg hover:bg-[#262018] text-[#5c5040] hover:text-gold-400 transition-colors"
          >
            <CalendarDays size={14} />
          </a>
          <Link
            href={`/records/${record.id}`}
            title="View record"
            className="p-1.5 rounded-lg hover:bg-[#262018] text-[#5c5040] hover:text-[#f5f0e8] transition-colors"
          >
            <ArrowRight size={14} />
          </Link>
        </div>
      </td>
    </tr>
  )
}
