'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Building2, ChevronRight, Upload } from 'lucide-react'
import { getUnits, createUnit, extractError } from '@/lib/api'
import type { Unit, UnitStatusTag } from '@/lib/types'
import { BUILDINGS, LISTER_OPTIONS, ALL_UNIT_TAGS, UNIT_TAG_STYLES } from '@/lib/types'
import { UnitTagBadges } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import type { PropertyRecord } from '@/lib/types'
import BulkUploadModal from './BulkUploadModal'

const RECORD_TYPE_BADGE: Record<string, string> = {
  checkin:     'bg-blue-500/20 text-blue-300',
  checkout:    'bg-orange-500/20 text-orange-300',
  maintenance: 'bg-purple-500/20 text-purple-300',
  renewal:     'bg-violet-500/20 text-violet-300',
}

const RECORD_TYPE_SHORT: Record<string, string> = {
  checkin:     'Check-in',
  checkout:    'Check-out',
  maintenance: 'Maintenance',
  renewal:     'Renewal',
}

const PAYMENT_PILL_STYLE: Record<string, string> = {
  'Invoice Sent':   'bg-[#FCEBEB] text-[#A32D2D]',
  'Partially Paid': 'bg-[#FAEEDA] text-[#854F0B]',
  'Fully Paid':     'bg-[#EAF3DE] text-[#3B6D11]',
}

function getPaymentStatus(tasks: { title: string; status: string }[]): string | null {
  return tasks.find(t => t.title === 'Payment Status')?.status ?? null
}

function taskCountColor(done: number, total: number): string {
  if (total === 0 || done === total) return 'text-emerald-400'
  if (done / total > 0.5) return 'text-orange-400'
  return 'text-red-400'
}

const BUILDING_FILTER = ['All', ...BUILDINGS]

export default function UnitsPage() {
  const router = useRouter()
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('All')
  const [tagFilter, setTagFilter] = useState<UnitStatusTag | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getUnits()
      setUnits(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = units.filter((u) => {
    const matchSearch =
      u.unit_number.toLowerCase().includes(search.toLowerCase()) ||
      u.building.toLowerCase().includes(search.toLowerCase()) ||
      (u.records ?? []).some((r) =>
        r.tenant_name?.toLowerCase().includes(search.toLowerCase()),
      )
    const matchBuilding = buildingFilter === 'All' || u.building === buildingFilter
    const matchTag = tagFilter === 'all' || (u.status ?? []).includes(tagFilter)
    return matchSearch && matchBuilding && matchTag
  })


  return (
    <div className="px-4 py-5 space-y-5">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5c5040]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search units, buildings, tenants…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#332c20] bg-[#1e1a14] text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
        />
      </div>

      {/* Tag filter + building filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {/* Tag filter */}
        <button
          onClick={() => setTagFilter('all')}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tagFilter === 'all'
              ? 'bg-gold-500 text-[#0e0c08]'
              : 'bg-[#1e1a14] border border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
          }`}
        >
          All
        </button>
        {ALL_UNIT_TAGS.map((tag) => {
          const style = UNIT_TAG_STYLES[tag]
          return (
            <button
              key={tag}
              onClick={() => setTagFilter(tag)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tagFilter === tag
                  ? 'bg-gold-500 text-[#0e0c08] border-gold-500'
                  : 'bg-[#1e1a14] border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
              }`}
            >
              {style.label}
            </button>
          )
        })}

        <div className="border-l border-[#332c20] mx-1" />

        {/* Building filter */}
        {BUILDING_FILTER.map((b) => (
          <button
            key={b}
            onClick={() => setBuildingFilter(b)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              buildingFilter === b
                ? 'bg-[#262018] border border-gold-500/50 text-gold-400'
                : 'bg-[#1e1a14] border border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Count + Add */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#7c6f54]">
          {loading ? 'Loading…' : `${filtered.length} unit${filtered.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => setShowBulkUpload(true)}>
            Bulk Upload
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
            Add Unit
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title="No units found"
          description="Try adjusting your filters or add a new unit."
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
              Add Unit
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((unit) => (
            <UnitCard key={unit.id} unit={unit} onClick={() => router.push(`/units/${unit.id}`)} />
          ))}
        </div>
      )}

      <AddUnitModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />
      <BulkUploadModal open={showBulkUpload} onClose={() => setShowBulkUpload(false)} onDone={load} />
    </div>
  )
}

function UnitCard({ unit, onClick }: { unit: Unit; onClick: () => void }) {
  const activeRecord = (unit.records ?? []).find((r) => r.status === 'active')
  const tags = unit.status ?? []
  const allRecords = unit.records ?? []

  const outstanding = allRecords
    .filter(r => (r.tasks ?? []).some(t => t.status !== 'Completed' && t.status !== 'Fully Paid'))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const shown = outstanding.slice(0, 2)
  const extra = outstanding.length - shown.length

  const payStatuses = outstanding.map(r => getPaymentStatus(r.tasks ?? []))
  const urgentColor = payStatuses.some(s => s === 'Invoice Sent')
    ? '#E24B4A'
    : payStatuses.some(s => s === 'Partially Paid')
    ? '#EF9F27'
    : payStatuses.some(s => s === 'Fully Paid')
    ? '#3B6D11'
    : null

  return (
    <div
      onClick={onClick}
      className={[
        'rounded-2xl border border-[#332c20] bg-[#1e1a14] p-4',
        'cursor-pointer hover:border-gold-500/40 hover:bg-[#262018] transition-colors',
        urgentColor ? 'border-l-[3px]' : '',
      ].join(' ')}
      style={urgentColor ? { borderLeftColor: urgentColor } : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-[#f5f0e8]">{unit.unit_number}</span>
          <p className="text-xs text-[#5c5040] mt-0.5">{unit.building}</p>
          {tags.length > 0 && (
            <div className="mt-1.5">
              <UnitTagBadges tags={tags} />
            </div>
          )}
          {activeRecord?.monthly_rental && (
            <p className="text-xs text-[#7c6f54] mt-1">
              {formatCurrency(activeRecord.monthly_rental)}/mo
            </p>
          )}
          {unit.lister && (
            <p className="text-xs text-[#4a4030] mt-0.5">Lister: {unit.lister}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {allRecords.length > 0 && (
            <span className="text-xs text-[#5c5040]">
              {allRecords.length} record{allRecords.length !== 1 ? 's' : ''}
            </span>
          )}
          <ChevronRight size={16} className="text-[#5c5040]" />
        </div>
      </div>

      {shown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#332c20] space-y-1.5">
          {shown.map(r => <RecordSummaryRow key={r.id} record={r} />)}
          {extra > 0 && (
            <p className="text-[11px] text-[#5c5040] pl-0.5">+{extra} more</p>
          )}
        </div>
      )}
    </div>
  )
}

function RecordSummaryRow({ record }: { record: PropertyRecord }) {
  const tasks = (record.tasks ?? []) as { title: string; status: string }[]
  const done = tasks.filter(t => t.status === 'Completed' || t.status === 'Fully Paid').length
  const total = tasks.length
  const payStatus = getPaymentStatus(tasks)

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold ${RECORD_TYPE_BADGE[record.type] ?? ''}`}>
        {RECORD_TYPE_SHORT[record.type] ?? record.type}
      </span>
      {total > 0 && (
        <span className={`text-xs font-medium tabular-nums ${taskCountColor(done, total)}`}>
          {done}/{total} tasks
        </span>
      )}
      {payStatus && PAYMENT_PILL_STYLE[payStatus] && (
        <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold ${PAYMENT_PILL_STYLE[payStatus]}`}>
          {payStatus}
        </span>
      )}
    </div>
  )
}

function AddUnitModal({
  open, onClose, onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const [building, setBuilding] = useState<string>('')
  const [unitNumber, setUnitNumber] = useState('')
  const [lister, setLister] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!building || !unitNumber.trim()) { setError('Building and unit number are required.'); return }
    setLoading(true); setError('')
    try {
      await createUnit({ building, unit_number: unitNumber.trim(), lister: lister || null, notes: notes.trim() || null, status: [] })
      setBuilding(''); setUnitNumber(''); setLister(''); setNotes('')
      onAdded()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Unit">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Building" value={building} onChange={(e) => setBuilding(e.target.value)}
          placeholder="Select building…" options={BUILDINGS.map((b) => ({ value: b, label: b }))}
        />
        <Input
          label="Unit Number" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)}
          placeholder="e.g. A-12-03"
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
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>Add Unit</Button>
        </div>
      </form>
    </Modal>
  )
}
