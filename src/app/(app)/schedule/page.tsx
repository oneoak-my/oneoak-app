'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, CalendarDays } from 'lucide-react'
import { getUpcomingCheckins, updateRecord } from '@/lib/api'
import type { PropertyRecord, Unit, Task } from '@/lib/types'
import { RECORD_STATUS_COLORS } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type CheckinRecord = PropertyRecord & { unit: Unit; tasks: Task[] }

type Filter = 'all' | 'week' | 'month'

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
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
  const end = `${dateStr}T${endHH}${startMM}00`

  const unit = record.unit
  const title = encodeURIComponent(`Check-in: ${unit?.unit_number ?? ''} - ${record.tenant_name ?? ''}`)
  const details = encodeURIComponent(
    `Unit: ${unit?.unit_number ?? ''} | Tenant: ${record.tenant_name ?? ''} | Lister: ${unit?.lister ?? '—'}`,
  )
  const location = encodeURIComponent(unit?.building ?? '')

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`
}

function daysUntilDate(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function applyFilter(records: CheckinRecord[], filter: Filter): CheckinRecord[] {
  if (filter === 'all') return records
  const cutoff = filter === 'week' ? 7 : 30
  return records.filter((r) => {
    const d = daysUntilDate(r.move_in_date ?? r.date)
    return d >= 0 && d <= cutoff
  })
}

export default function SchedulePage() {
  const [records, setRecords] = useState<CheckinRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

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

  const visible = applyFilter(records, filter)

  return (
    <div className="px-4 py-5 space-y-4">
      <h1 className="text-lg font-bold text-[#f5f0e8]">Check-in Schedule</h1>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'week', 'month'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-gold-500 text-[#0e0c08]'
                : 'bg-[#1e1a14] border border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
            }`}
          >
            {f === 'all' ? 'All' : f === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-2xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-sm text-[#5c5040]">
          No upcoming check-ins 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((record) => (
            <ScheduleCard key={record.id} record={record} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleCard({ record, onSaved }: { record: CheckinRecord; onSaved: () => void }) {
  const [editingTime, setEditingTime] = useState(false)
  const [timeValue, setTimeValue] = useState(record.appointment_time?.slice(0, 5) ?? '')
  const [saving, setSaving] = useState(false)

  const moveInDate = record.move_in_date ?? record.date
  const days = daysUntilDate(moveInDate)
  const isUrgent = days >= 0 && days <= 7

  const tasks = record.tasks ?? []
  const completedCount = tasks.filter((t) => t.status === 'Completed').length
  const progress = tasks.length > 0 ? completedCount / tasks.length : 0

  const recStatus = record.record_status ?? 'Open'
  const statusColor = RECORD_STATUS_COLORS[recStatus] ?? RECORD_STATUS_COLORS['Open']

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

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${
      isUrgent ? 'border-red-500/30 bg-red-500/5' : 'border-[#332c20] bg-[#1e1a14]'
    }`}>
      {/* Urgent badge */}
      {isUrgent && (
        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold tracking-wide">
          URGENT — {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
        </span>
      )}

      {/* Core info */}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-[#f5f0e8]">Unit: {record.unit?.unit_number}</p>
        <p className="text-xs text-[#5c5040]">{record.unit?.building}</p>
        {record.tenant_name && (
          <p className="text-xs text-[#7c6f54]">Tenant: {record.tenant_name}</p>
        )}
        <p className="text-xs text-[#7c6f54]">Move-in: {formatDate(moveInDate)}</p>

        {/* Appointment time — inline edit */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-[#7c6f54]">Appt Time:</span>
          {editingTime ? (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="rounded-lg bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] px-2 py-1 focus:outline-none focus:border-gold-500/60"
              />
              <button
                onClick={saveTime}
                disabled={saving}
                className="text-xs text-gold-400 hover:text-gold-300 font-medium"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingTime(false); setTimeValue(record.appointment_time?.slice(0, 5) ?? '') }}
                className="text-xs text-[#5c5040] hover:text-[#7c6f54]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#f5f0e8]">{formatTime(record.appointment_time)}</span>
              <button
                onClick={() => setEditingTime(true)}
                className="text-[10px] text-[#5c5040] hover:text-gold-400 underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status + lister */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
          {recStatus}
        </span>
        {record.unit?.lister && (
          <span className="text-[10px] text-[#5c5040]">Lister: {record.unit.lister}</span>
        )}
      </div>

      {/* Task progress */}
      {tasks.length > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 bg-[#332c20] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${isUrgent ? 'bg-red-500' : 'bg-gold-500'}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-[#5c5040]">Tasks: {completedCount}/{tasks.length} done</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-0.5">
        <a
          href={buildCalendarUrl(record)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262018] border border-[#332c20] text-xs text-[#a89d84] hover:text-[#f5f0e8] hover:border-gold-500/30 transition-colors"
        >
          <CalendarDays size={12} />
          Add to Calendar
        </a>
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
