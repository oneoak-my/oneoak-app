'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2, Receipt, LogIn, LogOut, Wrench, CalendarDays, ChevronRight, Plus,
} from 'lucide-react'
import {
  getUnits, getOutstandingServices, createUnit, extractError, testConnection,
  getActiveRecordsWithTasks,
} from '@/lib/api'
import type { Unit, Service, PropertyRecord, RecordWithTasks } from '@/lib/types'
import { BUILDINGS, LISTER_OPTIONS, RECORD_STATUS_COLORS, RECORD_TYPE_LABELS } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import Badge, { statusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'

type FlatRecord = PropertyRecord & { unit: Unit }

export default function DashboardPage() {
  const router = useRouter()
  const [units, setUnits] = useState<Unit[]>([])
  const [outstanding, setOutstanding] = useState<Service[]>([])
  const [taskRecords, setTaskRecords] = useState<RecordWithTasks[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  function load() {
    testConnection().then(({ ok, error }) => {
      if (!ok) {
        setDbError(error ?? 'Cannot connect to database.')
        setLoading(false)
        return
      }
      setDbError(null)
      Promise.all([getUnits(), getOutstandingServices(), getActiveRecordsWithTasks()])
        .then(([u, s, tr]) => { setUnits(u); setOutstanding(s); setTaskRecords(sortTaskRecords(tr)) })
        .catch((e) => setDbError(extractError(e)))
        .finally(() => setLoading(false))
    })
  }

  useEffect(() => { load() }, [])

  const allRecords: FlatRecord[] = units.flatMap((u) =>
    (u.records ?? []).map((r) => ({ ...r, unit: u }))
  )

  const pendingCheckinReport = allRecords.filter(
    (r) => r.type === 'checkin' && r.status === 'active' && !r.is_report_generated
  ).length

  const pendingCheckoutReport = allRecords.filter(
    (r) => r.type === 'checkout' && r.status === 'active' && !r.is_report_generated
  ).length

  const pendingMaintenance = allRecords.filter(
    (r) => r.type === 'maintenance' && r.status === 'active'
  ).length

  const today = new Date().toISOString().split('T')[0]
  const upcomingCheckinCount = allRecords.filter(
    (r) => r.type === 'checkin' &&
      (r.move_in_date ?? r.date) >= today &&
      r.record_status !== 'Active Tenancy',
  ).length

  const outstandingTotal = outstanding.reduce((s, sv) => s + (sv.amount ?? 0), 0)

  return (
    <div className="px-4 py-5 space-y-6">
      {dbError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-xs font-semibold text-red-400 mb-0.5">Database error</p>
          <p className="text-xs text-red-300">{dbError}</p>
          <p className="text-xs text-red-400/70 mt-1">Make sure you ran the SQL schema in Supabase.</p>
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-xs text-[#7c6f54] uppercase tracking-widest font-medium">Welcome back</p>
        <h1 className="text-2xl font-bold text-[#f5f0e8] mt-0.5">
          Good {getGreeting()}, <span className="text-gold-400">Elleen</span> 👋
        </h1>
      </div>

      {/* Stats — 6 cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total Units"
          value={loading ? '—' : units.length}
          icon={<Building2 size={18} />}
          href="/units"
        />
        <StatCard
          label="Outstanding Bills"
          value={loading ? '—' : formatCurrency(outstandingTotal)}
          icon={<Receipt size={18} />}
          href="/bills"
          accent
        />
        <StatCard
          label="Pending CI Report"
          value={loading ? '—' : pendingCheckinReport}
          icon={<LogIn size={18} />}
          sub="check-in records"
          warn={pendingCheckinReport > 0}
          href="/records?type=checkin&report=pending"
        />
        <StatCard
          label="Pending CO Report"
          value={loading ? '—' : pendingCheckoutReport}
          icon={<LogOut size={18} />}
          sub="check-out records"
          warn={pendingCheckoutReport > 0}
          href="/records?type=checkout&report=pending"
        />
        <StatCard
          label="Pending Maintenance"
          value={loading ? '—' : pendingMaintenance}
          icon={<Wrench size={18} />}
          sub="active jobs"
          href="/records?type=maintenance&status=pending"
        />
        <StatCard
          label="Upcoming Check-ins"
          value={loading ? '—' : upcomingCheckinCount}
          icon={<CalendarDays size={18} />}
          sub="future move-ins"
          href="/schedule"
        />
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-medium text-[#7c6f54] uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowAddUnit(true)}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-[#332c20] bg-[#1e1a14] hover:border-gold-500/40 hover:bg-[#262018] transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-gold-500/10 text-gold-400"><Plus size={16} /></div>
            <span className="text-sm font-medium text-[#f5f0e8]">Add Unit</span>
          </button>
          <Link
            href="/bills"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-[#332c20] bg-[#1e1a14] hover:border-gold-500/40 hover:bg-[#262018] transition-colors"
          >
            <div className="p-2 rounded-lg bg-gold-500/10 text-gold-400"><Receipt size={16} /></div>
            <span className="text-sm font-medium text-[#f5f0e8]">View Bills</span>
          </Link>
          <Link
            href="/schedule"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-[#332c20] bg-[#1e1a14] hover:border-gold-500/40 hover:bg-[#262018] transition-colors col-span-2"
          >
            <div className="p-2 rounded-lg bg-gold-500/10 text-gold-400"><CalendarDays size={16} /></div>
            <span className="text-sm font-medium text-[#f5f0e8]">Upcoming Check-ins</span>
          </Link>
        </div>
      </div>

      {/* Tasks & Upcoming */}
      <div>
        <p className="text-xs font-medium text-[#7c6f54] uppercase tracking-wider mb-3">Tasks & Upcoming</p>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
            ))
          ) : taskRecords.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#5c5040]">
              No active records with open tasks.
            </div>
          ) : (
            taskRecords.map((r) => <RecordTaskCard key={r.id} record={r} />)
          )}
        </div>
      </div>

      {/* Add Unit Modal */}
      <AddUnitModal
        open={showAddUnit}
        onClose={() => setShowAddUnit(false)}
        onAdded={(id) => {
          setShowAddUnit(false)
          router.push(`/units/${id}`)
        }}
      />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getKeyDate(r: RecordWithTasks): string | null {
  return r.type === 'checkin' ? (r.move_in_date ?? r.date) : r.date
}

function sortTaskRecords(records: RecordWithTasks[]): RecordWithTasks[] {
  return [...records].sort((a, b) => {
    const da = getKeyDate(a)
    const db = getKeyDate(b)
    if (da && db) {
      const diff = da.localeCompare(db)
      if (diff !== 0) return diff
    } else if (da) return -1
    else if (db) return 1
    const incA = (a.tasks ?? []).filter((t) => t.status !== 'Completed').length
    const incB = (b.tasks ?? []).filter((t) => t.status !== 'Completed').length
    return incB - incA
  })
}

function daysLabel(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d ago`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `In ${diff}d`
}

// ── Record task card ──────────────────────────────────────────────────────────

function RecordTaskCard({ record }: { record: RecordWithTasks }) {
  const tasks = record.tasks ?? []
  const incompleteTasks = tasks.filter((t) => t.status !== 'Completed')
  const completedCount = tasks.length - incompleteTasks.length
  const progress = tasks.length > 0 ? completedCount / tasks.length : 0

  const keyDate = getKeyDate(record)
  const daysUntil = keyDate
    ? Math.ceil((new Date(keyDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const isUrgent = daysUntil !== null && daysUntil <= 7 && daysUntil >= 0

  const typeBadge = statusBadge(record.type)
  const recStatus = record.record_status ?? 'Open'
  const statusColor = RECORD_STATUS_COLORS[recStatus] ?? RECORD_STATUS_COLORS['Open']

  return (
    <Link href={`/records/${record.id}`}>
      <div className={`rounded-2xl border p-4 space-y-3 transition-colors ${
        isUrgent ? 'border-red-500/30 bg-red-500/5' : 'border-[#332c20] bg-[#1e1a14]'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[#f5f0e8] text-sm">
                {record.unit?.unit_number}
              </span>
              <span className="text-[#5c5040] text-xs">{record.unit?.building}</span>
              <Badge variant={typeBadge.variant}>{RECORD_TYPE_LABELS[record.type]}</Badge>
              {isUrgent && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold tracking-wide">
                  URGENT
                </span>
              )}
            </div>
            {record.tenant_name && (
              <p className="text-xs text-[#7c6f54] mt-0.5 truncate">{record.tenant_name}</p>
            )}
          </div>
          <ChevronRight size={14} className="text-[#5c5040] shrink-0 mt-1" />
        </div>

        {/* Date + record status */}
        <div className="flex items-center gap-2 flex-wrap">
          {keyDate && (
            <span className="text-xs text-[#7c6f54]">
              {record.type === 'checkin' ? 'Move-in' : record.type === 'checkout' ? 'Move-out' : 'Date'}
              {': '}{formatDate(keyDate)}
              {daysUntil !== null && (
                <span className={isUrgent ? ' text-red-400 font-medium' : ' text-[#5c5040]'}>
                  {' '}({daysLabel(keyDate)})
                </span>
              )}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
            {recStatus}
          </span>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="h-1.5 bg-[#332c20] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isUrgent ? 'bg-red-500' : 'bg-gold-500'}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-[#5c5040]">
            {completedCount}/{tasks.length} tasks done
          </p>
        </div>

        {/* Incomplete task list */}
        {incompleteTasks.length > 0 && (
          <div className="space-y-1">
            {incompleteTasks.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-[#5c5040] shrink-0" />
                <span className="text-xs text-[#7c6f54] truncate">{t.title}</span>
              </div>
            ))}
            {incompleteTasks.length > 5 && (
              <p className="text-xs text-[#5c5040] pl-3">+{incompleteTasks.length - 5} more</p>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, sub, href, accent, warn,
}: {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  sub?: string
  href?: string
  accent?: boolean
  warn?: boolean
}) {
  const content = (
    <div className={`rounded-2xl border p-4 ${
      accent ? 'bg-gold-500/10 border-gold-500/30'
      : warn  ? 'bg-orange-500/10 border-orange-500/30'
      : 'bg-[#1e1a14] border-[#332c20]'
    }`}>
      <div className={`mb-3 ${accent ? 'text-gold-400' : warn ? 'text-orange-400' : 'text-[#7c6f54]'}`}>
        {icon}
      </div>
      <p className={`text-xl font-bold truncate ${
        accent ? 'text-gold-300' : warn ? 'text-orange-300' : 'text-[#f5f0e8]'
      }`}>
        {value}
      </p>
      <p className="text-xs text-[#7c6f54] mt-0.5">{label}</p>
      {sub && <p className="text-xs text-[#5c5040] mt-0.5">{sub}</p>}
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

// ── Add Unit Modal ────────────────────────────────────────────────────────────

function AddUnitModal({
  open, onClose, onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: (id: string) => void
}) {
  const [building, setBuilding] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [lister, setLister] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function reset() { setBuilding(''); setUnitNumber(''); setLister(''); setNotes(''); setError('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!building) { setError('Please select a building.'); return }
    if (!unitNumber.trim()) { setError('Unit number is required.'); return }
    setLoading(true); setError('')
    try {
      const created = await createUnit({
        building, unit_number: unitNumber.trim(), lister: lister || null, notes: notes.trim() || null, status: [],
      })
      reset(); onAdded(created.id)
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Add New Unit">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Building" value={building} onChange={(e) => setBuilding(e.target.value)}
          placeholder="Select building…" options={BUILDINGS.map((b) => ({ value: b, label: b }))}
        />
        <Input
          label="Unit Number" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)}
          placeholder="e.g. A-12-03" autoFocus
        />
        <Select
          label="Lister (agent who brought in this property)"
          value={lister} onChange={(e) => setLister(e.target.value)}
          placeholder="Select lister…"
          options={LISTER_OPTIONS.map((l) => ({ value: l, label: l }))}
        />
        <Input
          label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this unit…"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" type="button" fullWidth onClick={() => { reset(); onClose() }}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>Add Unit</Button>
        </div>
      </form>
    </Modal>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
