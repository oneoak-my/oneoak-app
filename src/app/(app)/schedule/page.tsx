'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { CalendarDays, ArrowRight, MessageCircle } from 'lucide-react'
import { getUpcomingCheckins, updateRecord } from '@/lib/api'
import type { PropertyRecord, Unit, Task } from '@/lib/types'
import { LISTER_OPTIONS } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type CheckinRecord = PropertyRecord & { unit: Unit; tasks: Task[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Short version for mobile: "11:30" with no AM/PM */
function formatTimeShort(timeStr: string | null | undefined): string {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  return `${h}:${String(m).padStart(2, '0')}`
}

function formatTimeWa(timeStr: string | null | undefined): string {
  if (!timeStr) return 'TBC'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDateLong(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Short version for mobile: "30 Apr" with no year */
function formatDateShort(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function daysUntilDate(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [y, mo, d] = dateStr.split('-').map(Number)
  const target = new Date(y, mo - 1, d)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function buildCalendarUrl(record: CheckinRecord, overrides?: Partial<CheckinRecord>): string {
  const r = { ...record, ...overrides }
  const rawDate = r.move_in_date ?? r.date
  const dateStr = rawDate.replace(/-/g, '')
  const timeStr = r.appointment_time ?? '10:00:00'
  const [h, m] = timeStr.split(':').map(Number)
  const startHH = String(h).padStart(2, '0')
  const startMM = String(m).padStart(2, '0')
  const endHH = String((h + 1) % 24).padStart(2, '0')
  const start = `${dateStr}T${startHH}${startMM}00`
  const end   = `${dateStr}T${endHH}${startMM}00`
  const unit  = r.unit
  const title    = encodeURIComponent(`Check-in: ${unit?.unit_number ?? ''} - ${r.tenant_name ?? ''}`)
  const details  = encodeURIComponent(`Unit: ${unit?.unit_number ?? ''} | Tenant: ${r.tenant_name ?? ''} | Lister: ${unit?.lister ?? '—'}`)
  const location = encodeURIComponent(unit?.building ?? '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`
}

function buildTenantWaUrl(record: CheckinRecord): string {
  const moveInDate = record.move_in_date ?? record.date
  const msg = [
    `Hi ${record.tenant_name ?? ''}! 👋`,
    '',
    'Just a quick reminder for your move-in appointment:',
    '',
    `📍 *Unit:* ${record.unit?.unit_number ?? ''}`,
    `📅 *Date:* ${formatDateLong(moveInDate)}`,
    `⏰ *Time:* ${formatTimeWa(record.appointment_time)}`,
    '',
    'I will wait for you at the lobby. See you then! 😊',
  ].join('\n')
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

function buildCoAgentWaUrl(record: CheckinRecord): string {
  const moveInDate = record.move_in_date ?? record.date
  const msg = [
    `Hi ${record.co_agent ?? ''}!`,
    '',
    'Just a quick reminder for the move-in appointment with your tenant:',
    '',
    `📍 *Unit:* ${record.unit?.unit_number ?? ''}`,
    `📅 *Date:* ${formatDateLong(moveInDate)}`,
    `⏰ *Time:* ${formatTimeWa(record.appointment_time)}`,
    '',
    "All good on your end? Let me know if there's any changes, thanks!",
  ].join('\n')
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

function yyyyMM(dateStr: string): string {
  const [y, mo] = dateStr.split('-')
  return `${y}-${mo}`
}

function monthLabel(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function CalendarToast({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1e1a14] border border-[#332c20] rounded-xl px-4 py-3 shadow-xl text-sm text-[#a89d84] whitespace-nowrap">
      <span>📅 Update Google Calendar?</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onDismiss}
        className="text-gold-400 hover:text-gold-300 font-medium transition-colors"
      >
        Open →
      </a>
      <button onClick={onDismiss} className="text-[#5c5040] hover:text-[#7c6f54] ml-1">✕</button>
    </div>
  )
}

// ── Select style ──────────────────────────────────────────────────────────────

const selectCls =
  'rounded-lg bg-[#1e1a14] border border-[#332c20] text-xs text-[#a89d84] px-3 py-2 focus:outline-none focus:border-gold-500/60 appearance-none pr-7 cursor-pointer'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [records, setRecords]           = useState<CheckinRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [monthFilter, setMonthFilter]   = useState('all')
  const [listerFilter, setListerFilter] = useState('all')
  const [sortOrder, setSortOrder]       = useState<'asc' | 'desc'>('asc')
  const [toast, setToast]               = useState<string | null>(null)

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

  const showToast = useCallback((url: string) => { setToast(url) }, [])

  return (
    <div className="py-5 space-y-4">
      <h1 className="text-lg font-bold text-[#f5f0e8] px-4">Check-in Schedule</h1>

      {/* Filters */}
      <div className="px-4 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectCls}>
            <option value="all">All Months</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>{monthLabel(ym)}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
        </div>

        <div className="relative">
          <select value={listerFilter} onChange={(e) => setListerFilter(e.target.value)} className={selectCls}>
            <option value="all">All Listers</option>
            {LISTER_OPTIONS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
        </div>

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
        <>
          <div className="overflow-x-auto border-t border-[#1e1a14]">
            <table className="w-full border-collapse text-xs sm:text-[13px]" style={{ minWidth: '620px' }}>
              <thead>
                <tr className="border-b border-[#332c20] bg-[#0e0c08]">
                  <th className="sticky left-0 z-[2] bg-[#0e0c08] px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '85px' }}>
                    Date
                  </th>
                  <th className="sticky bg-[#0e0c08] px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap border-r border-[#332c20]" style={{ left: '85px', zIndex: 1, minWidth: '90px' }}>
                    Unit
                  </th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider" style={{ minWidth: '90px' }}>Tenant</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '60px' }}>Time</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '50px' }}>Tasks</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '55px' }}>Lister</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '60px' }}>CoA</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '44px' }}>WA</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-[10px] font-semibold text-[#5c5040] uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '64px' }}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((record) => (
                  <ScheduleRow key={record.id} record={record} onSaved={load} onToast={showToast} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile scroll hint */}
          <p className="sm:hidden px-4 text-[10px] text-[#5c5040] text-right -mt-1">scroll →</p>
        </>
      )}

      {toast && <CalendarToast url={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ScheduleRow({
  record,
  onSaved,
  onToast,
}: {
  record: CheckinRecord
  onSaved: () => void
  onToast: (url: string) => void
}) {
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue]     = useState(record.move_in_date ?? record.date)
  const [editingTime, setEditingTime] = useState(false)
  const [timeValue, setTimeValue]     = useState(record.appointment_time?.slice(0, 5) ?? '')
  const [editingCoA, setEditingCoA]   = useState(false)
  const [coaMode, setCoaMode]         = useState<'select' | 'manual'>('select')
  const [coaValue, setCoaValue]       = useState(record.co_agent ?? '')
  const [showWa, setShowWa]           = useState(false)
  const [saving, setSaving]           = useState(false)
  const waRef = useRef<HTMLDivElement>(null)

  const moveInDate = record.move_in_date ?? record.date
  const days       = daysUntilDate(moveInDate)
  const isPast     = days < 0
  const isToday    = days === 0
  const isTomorrow = days === 1
  const isUrgent   = days >= 0 && days <= 7

  const tasks          = record.tasks ?? []
  const completedCount = tasks.filter((t) => t.status === 'Completed').length
  const allDone        = tasks.length > 0 && completedCount === tasks.length
  const noneDone       = completedCount === 0

  const dotColor = allDone  ? 'bg-emerald-500'
    : !noneDone             ? 'bg-orange-500'
    : isUrgent              ? 'bg-red-500'
    : 'bg-[#3d3628]'

  let dateCls = 'text-[#f5f0e8]'
  if (isPast)     dateCls = 'text-red-500 line-through'
  else if (isToday)    dateCls = 'text-red-400 font-semibold'
  else if (isTomorrow) dateCls = 'text-orange-400 font-semibold'
  else if (isUrgent)   dateCls = 'text-red-400'

  const dateLabelFull  = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatDate(moveInDate)
  const dateLabelShort = isToday ? 'Today' : isTomorrow ? 'Tmrw'     : formatDateShort(moveInDate)

  // Close WA popup on outside click
  useEffect(() => {
    if (!showWa) return
    function handler(e: MouseEvent) {
      if (waRef.current && !waRef.current.contains(e.target as Node)) setShowWa(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showWa])

  async function saveDate() {
    setSaving(true)
    try {
      await updateRecord(record.id, { move_in_date: dateValue })
      setEditingDate(false)
      onSaved()
      onToast(buildCalendarUrl(record, { move_in_date: dateValue }))
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function saveTime() {
    setSaving(true)
    try {
      const appt = timeValue || null
      await updateRecord(record.id, { appointment_time: appt })
      setEditingTime(false)
      onSaved()
      onToast(buildCalendarUrl(record, { appointment_time: appt }))
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function saveCoA() {
    setSaving(true)
    try {
      await updateRecord(record.id, { co_agent: coaValue || null })
      setEditingCoA(false)
      setCoaMode('select')
      onSaved()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function cancelCoA() {
    setEditingCoA(false)
    setCoaMode('select')
    setCoaValue(record.co_agent ?? '')
  }

  const rowBg = isUrgent ? 'bg-red-500/[0.03]' : ''

  return (
    <tr className={`border-b border-[#1e1a14] hover:bg-[#1e1a14] transition-colors ${rowBg}`}>

      {/* Move-in Date — sticky col 1
          bg-[#0e0c08] lets warm theme CSS override to #F7F5F2 automatically */}
      <td className={`sticky left-0 z-[2] bg-[#0e0c08] px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap font-mono`}>
        {editingDate ? (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="rounded bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] px-1.5 py-1 focus:outline-none focus:border-gold-500/60 w-28"
            />
            <button onClick={saveDate} disabled={saving} className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium">
              {saving ? '…' : '✓'}
            </button>
            <button onClick={() => { setEditingDate(false); setDateValue(record.move_in_date ?? record.date) }} className="text-[11px] text-[#5c5040] hover:text-[#7c6f54]">
              ✕
            </button>
          </div>
        ) : (
          <button onClick={() => setEditingDate(true)} className={`hover:opacity-70 transition-opacity ${dateCls}`}>
            <span className="sm:hidden">{dateLabelShort}</span>
            <span className="hidden sm:inline">{dateLabelFull}</span>
          </button>
        )}
      </td>

      {/* Unit — sticky col 2 */}
      <td
        className="sticky bg-[#0e0c08] px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap font-semibold text-[#f5f0e8] border-r border-[#332c20] truncate max-w-[90px]"
        style={{ left: '85px', zIndex: 1 }}
      >
        {record.unit?.unit_number}
      </td>

      {/* Tenant */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-[#7c6f54] max-w-[100px] truncate">
        {record.tenant_name ?? '—'}
      </td>

      {/* Appt Time */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap font-mono">
        {editingTime ? (
          <div className="flex items-center gap-1">
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="rounded bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] px-1.5 py-1 focus:outline-none focus:border-gold-500/60 w-24"
            />
            <button onClick={saveTime} disabled={saving} className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium">
              {saving ? '…' : '✓'}
            </button>
            <button onClick={() => { setEditingTime(false); setTimeValue(record.appointment_time?.slice(0, 5) ?? '') }} className="text-[11px] text-[#5c5040] hover:text-[#7c6f54]">
              ✕
            </button>
          </div>
        ) : (
          <button onClick={() => setEditingTime(true)} className="text-[#a89d84] hover:text-gold-400 underline underline-offset-2 transition-colors">
            <span className="sm:hidden">{formatTimeShort(record.appointment_time)}</span>
            <span className="hidden sm:inline">{formatTimeDisplay(record.appointment_time)}</span>
          </button>
        )}
      </td>

      {/* Tasks */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full shrink-0 hidden sm:block ${dotColor}`} />
          <span className="text-[#a89d84] font-mono">
            {tasks.length > 0 ? `${completedCount}/${tasks.length}` : '—'}
          </span>
        </div>
      </td>

      {/* Lister */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-[#5c5040]">
        <span className="sm:hidden">{(record.unit?.lister ?? '—').split(' ')[0]}</span>
        <span className="hidden sm:inline">{record.unit?.lister ?? '—'}</span>
      </td>

      {/* CoA */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
        {editingCoA ? (
          <div className="flex items-center gap-1">
            {coaMode === 'select' ? (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === '__manual__') {
                    setCoaMode('manual')
                    setCoaValue('')
                  } else {
                    setCoaValue('')
                  }
                }}
                className="rounded bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] px-1.5 py-1 focus:outline-none focus:border-gold-500/60"
              >
                <option value="">N/A</option>
                <option value="__manual__">Type manually...</option>
              </select>
            ) : (
              <input
                type="text"
                value={coaValue}
                onChange={(e) => setCoaValue(e.target.value)}
                placeholder="Co-agent name"
                autoFocus
                className="rounded bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] px-1.5 py-1 focus:outline-none focus:border-gold-500/60 w-24"
              />
            )}
            <button onClick={saveCoA} disabled={saving} className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium">
              {saving ? '…' : '✓'}
            </button>
            <button onClick={cancelCoA} className="text-[11px] text-[#5c5040] hover:text-[#7c6f54]">✕</button>
          </div>
        ) : (
          <button
            onClick={() => {
              setCoaMode(record.co_agent ? 'manual' : 'select')
              setCoaValue(record.co_agent ?? '')
              setEditingCoA(true)
            }}
            className="text-[#5c5040] hover:text-[#a89d84] transition-colors truncate max-w-[80px] block"
          >
            {record.co_agent ?? 'N/A'}
          </button>
        )}
      </td>

      {/* WA Remind */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
        <div className="relative" ref={waRef}>
          <button
            onClick={() => setShowWa((v) => !v)}
            title="Send reminder"
            className="p-1.5 rounded-lg hover:bg-[#262018] text-[#5c5040] hover:text-emerald-400 transition-colors"
          >
            <MessageCircle size={14} />
          </button>
          {showWa && (
            <div className="absolute bottom-full left-0 mb-1 z-20 bg-[#1e1a14] border border-[#332c20] rounded-xl shadow-xl py-1 min-w-[160px]">
              {record.tenant_name ? (
                <a
                  href={buildTenantWaUrl(record)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowWa(false)}
                  className="block px-4 py-2 text-xs text-[#a89d84] hover:bg-[#262018] hover:text-[#f5f0e8] transition-colors rounded-t-xl"
                >
                  Message Tenant
                </a>
              ) : null}
              {record.co_agent ? (
                <a
                  href={buildCoAgentWaUrl(record)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowWa(false)}
                  className="block px-4 py-2 text-xs text-[#a89d84] hover:bg-[#262018] hover:text-[#f5f0e8] transition-colors rounded-b-xl"
                >
                  Message Co-Agent
                </a>
              ) : null}
              {!record.tenant_name && !record.co_agent && (
                <div className="px-4 py-2 text-xs text-[#5c5040]">No recipients set</div>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
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
