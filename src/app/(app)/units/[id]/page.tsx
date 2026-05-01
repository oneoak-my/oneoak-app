'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, ChevronRight, MoreHorizontal, Trash2, Edit2,
  ClipboardList, LogIn, LogOut, Wrench,
} from 'lucide-react'
import { getUnit, createRecord, updateUnit, deleteUnit, extractError } from '@/lib/api'
import type { Unit, PropertyRecord, UnitStatusTag, BadgeVariant } from '@/lib/types'
import { BUILDINGS, LISTER_OPTIONS, RECORD_TYPE_LABELS, UTILITY_OPTIONS, ALL_UNIT_TAGS, UNIT_TAG_STYLES } from '@/lib/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { UnitTagBadges } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Input, { Select, Textarea } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'

const TAG_ACTIVE_CLASSES: Record<BadgeVariant, string> = {
  gold:   'bg-gold-500/20 border-gold-500/40 text-gold-300',
  green:  'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  red:    'bg-red-500/20 border-red-500/40 text-red-300',
  orange: 'bg-orange-500/20 border-orange-500/40 text-orange-300',
  gray:   'bg-[#332c20] border-[#3d3628] text-[#a89d84]',
  blue:   'bg-blue-500/20 border-blue-500/40 text-blue-300',
  purple: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
  yellow: 'bg-yellow-500 border-yellow-600 text-black',
}

const RECORD_TYPE_ICONS = {
  checkin: <LogIn size={16} />,
  checkout: <LogOut size={16} />,
  maintenance: <Wrench size={16} />,
}

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [unit, setUnit] = useState<Unit | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showAddRecord, setShowAddRecord] = useState(false)
  const [showEditUnit, setShowEditUnit] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await getUnit(id)
      setUnit(data)
    } catch (e) {
      console.error('getUnit error:', e)
      setLoadError(extractError(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleDeleteUnit() {
    if (!confirm('Delete this unit and all its records? This cannot be undone.')) return
    try {
      await deleteUnit(id)
      router.replace('/units')
    } catch (e) {
      console.error(e)
    }
  }

  async function toggleTag(tag: UnitStatusTag) {
    if (!unit) return
    const current = unit.status ?? []
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag]
    // Optimistic update
    setUnit((prev) => prev ? { ...prev, status: next } : prev)
    try {
      await updateUnit(unit.id, { status: next })
    } catch (e) {
      console.error(e)
      load() // revert on error
    }
  }

  const records = (unit?.records ?? []).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  if (loading) {
    return (
      <div className="px-4 py-5 space-y-4">
        <div className="h-8 w-32 bg-[#1e1a14] rounded-lg animate-pulse" />
        <div className="h-28 bg-[#1e1a14] rounded-2xl animate-pulse" />
        <div className="h-48 bg-[#1e1a14] rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="px-4 py-5">
        <EmptyState
          title={loadError ? 'Failed to load unit' : 'Unit not found'}
          description={loadError ?? 'This unit may have been deleted.'}
          action={
            <div className="flex gap-3">
              {loadError && (
                <Button variant="primary" onClick={() => { setLoading(true); load() }}>
                  Retry
                </Button>
              )}
              <Button onClick={() => router.push('/units')} icon={<ArrowLeft size={14} />}>
                Go back
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  const activeTags = unit.status ?? []

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/units')}
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
          ← Units
        </button>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-xl hover:bg-[#262018] text-[#7c6f54] transition-colors"
          >
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-10 z-20 min-w-[160px] rounded-xl border border-[#332c20] bg-[#1e1a14] shadow-xl overflow-hidden">
                <button
                  onClick={() => { setShowMenu(false); setShowEditUnit(true) }}
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-[#f5f0e8] hover:bg-[#262018] transition-colors"
                >
                  <Edit2 size={14} /> Edit Unit
                </button>
                <button
                  onClick={() => { setShowMenu(false); handleDeleteUnit() }}
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-red-400 hover:bg-[#262018] transition-colors"
                >
                  <Trash2 size={14} /> Delete Unit
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Unit header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f5f0e8] mb-1">{unit.unit_number}</h1>
        <p className="text-sm text-[#7c6f54] mb-1">{unit.building}</p>
        {unit.lister && (
          <p className="text-xs text-[#5c5040] mb-1">Lister: {unit.lister}</p>
        )}
        <p style={{ fontSize: '11px' }} className="text-[#4a4030] mb-2">
          {unit.created_by && `Added by ${unit.created_by}`}
          {unit.created_by && unit.updated_by && unit.updated_by !== unit.created_by && ` · Last updated by ${unit.updated_by}`}
        </p>

        {/* Active tags */}
        {activeTags.length > 0 && (
          <div className="mb-3">
            <UnitTagBadges tags={activeTags} />
          </div>
        )}

        {/* Tag toggle row */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_UNIT_TAGS.map((tag) => {
            const style = UNIT_TAG_STYLES[tag]
            const isActive = activeTags.includes(tag)
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                  isActive
                    ? TAG_ACTIVE_CLASSES[style.variant]
                    : 'bg-[#1e1a14] border-[#332c20] text-[#5c5040] hover:text-[#7c6f54]'
                }`}
              >
                {style.label}
              </button>
            )
          })}
        </div>

        {unit.notes && (
          <p className="mt-3 text-xs text-[#5c5040] bg-[#1e1a14] border border-[#332c20] rounded-lg px-3 py-2">
            {unit.notes}
          </p>
        )}
      </div>

      {/* Records header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">
          Records ({records.length})
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setShowAddRecord(true)}
        >
          Add Record
        </Button>
      </div>

      {/* Records list */}
      {records.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="No records yet"
          description="Add a check-in, check-out, or maintenance record."
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowAddRecord(true)}>
              Add Record
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <RecordCard
              key={r.id}
              record={r}
              onClick={() => router.push(`/records/${r.id}`)}
            />
          ))}
        </div>
      )}

      {/* Add Record Modal */}
      <AddRecordModal
        unitId={id}
        open={showAddRecord}
        onClose={() => setShowAddRecord(false)}
        onAdded={() => { setShowAddRecord(false); load() }}
      />

      {/* Edit Unit Modal */}
      <EditUnitModal
        unit={unit}
        open={showEditUnit}
        onClose={() => setShowEditUnit(false)}
        onSaved={() => { setShowEditUnit(false); load() }}
      />
    </div>
  )
}

function RecordCard({ record, onClick }: { record: PropertyRecord; onClick: () => void }) {
  const servicesCount = (record.services ?? []).length
  const totalAmount = (record.services ?? []).reduce((s, sv) => s + (sv.amount ?? 0), 0)

  return (
    <Card hoverable onClick={onClick}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-xl shrink-0 ${
            record.type === 'checkin' ? 'bg-blue-500/15 text-blue-400'
            : record.type === 'checkout' ? 'bg-red-500/15 text-red-400'
            : 'bg-orange-500/15 text-orange-400'
          }`}>
            {RECORD_TYPE_ICONS[record.type]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#f5f0e8]">{RECORD_TYPE_LABELS[record.type]}</span>
              {record.status === 'completed' && (
                <span className="text-[10px] bg-[#262018] border border-[#332c20] text-[#5c5040] px-1.5 py-0.5 rounded">
                  Completed
                </span>
              )}
            </div>
            <p className="text-xs text-[#7c6f54] truncate mt-0.5">
              {record.tenant_name ?? 'No tenant'} · {formatDate(record.date)}
            </p>
            {record.monthly_rental && (
              <p className="text-xs text-[#5c5040]">
                {formatCurrency(record.monthly_rental)}/mo
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="text-right">
            {servicesCount > 0 && (
              <p className="text-xs text-gold-400 font-medium">{formatCurrency(totalAmount)}</p>
            )}
            <p className="text-[10px] text-[#5c5040]">
              {servicesCount} service{servicesCount !== 1 ? 's' : ''}
            </p>
          </div>
          <ChevronRight size={14} className="text-[#5c5040]" />
        </div>
      </div>
    </Card>
  )
}

function AddRecordModal({
  unitId,
  open,
  onClose,
  onAdded,
}: {
  unitId: string
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [type, setType] = useState<'checkin' | 'checkout' | 'maintenance'>('checkin')
  const [tenantName, setTenantName] = useState('')
  const [date, setDate] = useState(today)
  const [monthlyRental, setMonthlyRental] = useState('')
  const [notes, setNotes] = useState('')
  const [coAgentMode, setCoAgentMode] = useState<'none' | 'manual'>('none')
  const [coAgentName, setCoAgentName] = useState('')
  // Check-in extras
  const [moveInDate, setMoveInDate] = useState(today)
  const [tenancyStart, setTenancyStart] = useState(today)
  const [tenancyEnd, setTenancyEnd] = useState('')
  // Check-out extras
  const [electricityStatus, setElectricityStatus] = useState('')
  const [waterStatus, setWaterStatus] = useState('')
  const [indahWaterStatus, setIndahWaterStatus] = useState('')
  const [gasStatus, setGasStatus] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const rental = parseFloat(monthlyRental) || 0
  const secDep = rental * 2
  const utilDep = rental * 0.5

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { setError('Date is required.'); return }
    setLoading(true)
    setError('')
    try {
      await createRecord({
        unit_id: unitId,
        type,
        tenant_name: tenantName.trim() || null,
        date,
        monthly_rental: rental || null,
        security_deposit: rental ? secDep : null,
        utility_deposit: rental ? utilDep : null,
        notes: notes.trim() || null,
        status: 'active',
        // Check-in fields
        move_in_date: type === 'checkin' ? (moveInDate || null) : null,
        tenancy_start_date: type !== 'maintenance' ? (tenancyStart || null) : null,
        tenancy_end_date: type !== 'maintenance' ? (tenancyEnd || null) : null,
        // Check-out fields
        electricity_status: type === 'checkout' ? (electricityStatus as PropertyRecord['electricity_status'] || null) : null,
        water_status: type === 'checkout' ? (waterStatus as PropertyRecord['water_status'] || null) : null,
        indah_water_status: type === 'checkout' ? (indahWaterStatus as PropertyRecord['indah_water_status'] || null) : null,
        gas_status: type === 'checkout' ? (gasStatus as PropertyRecord['gas_status'] || null) : null,
        tenant_bank_holder: type === 'checkout' ? (bankHolder.trim() || null) : null,
        tenant_bank_name: type === 'checkout' ? (bankName.trim() || null) : null,
        tenant_bank_account: type === 'checkout' ? (bankAccount.trim() || null) : null,
        co_agent_checkin: type === 'checkin' ? (coAgentMode === 'manual' ? coAgentName.trim() || null : null) : null,
      })
      onAdded()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Record">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Record type */}
        <div>
          <p className="text-xs font-medium text-[#a89d84] mb-2">Record Type</p>
          <div className="grid grid-cols-3 gap-2">
            {(['checkin', 'checkout', 'maintenance'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  type === t
                    ? 'bg-gold-500/20 border-gold-500/50 text-gold-300'
                    : 'bg-[#262018] border-[#332c20] text-[#7c6f54]'
                }`}
              >
                {RECORD_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Tenant Name"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          placeholder="Full name"
        />
        {type === 'checkin' && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-[#a89d84]">Co-Agent</p>
            {coAgentMode === 'none' ? (
              <select
                value=""
                onChange={(e) => { if (e.target.value === '__manual__') setCoAgentMode('manual') }}
                className="w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] focus:outline-none focus:border-gold-500/60 appearance-none cursor-pointer"
              >
                <option value="">No CoA (default)</option>
                <option value="__manual__">Type manually...</option>
              </select>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { setCoAgentMode('none'); setCoAgentName('') }}
                  className="text-xs text-[#7c6f54] hover:text-[#a89d84] transition-colors"
                >
                  ← No CoA (clear)
                </button>
                <input
                  type="text"
                  value={coAgentName}
                  onChange={(e) => setCoAgentName(e.target.value)}
                  placeholder="Co-agent name"
                  className="w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60 transition-colors"
                />
              </div>
            )}
          </div>
        )}
        <Input
          label={type === 'checkout' ? 'Move-out Date' : 'Date'}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {/* Check-in specific */}
        {type === 'checkin' && (
          <Input
            label="Move-in Date"
            type="date"
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
          />
        )}

        {/* Tenancy period (check-in & check-out) */}
        {type !== 'maintenance' && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tenancy Start"
              type="date"
              value={tenancyStart}
              onChange={(e) => setTenancyStart(e.target.value)}
            />
            <Input
              label="Tenancy End"
              type="date"
              value={tenancyEnd}
              onChange={(e) => setTenancyEnd(e.target.value)}
            />
          </div>
        )}

        {/* Financials (check-in & check-out) */}
        {type !== 'maintenance' && (
          <>
            <Input
              label="Monthly Rental (RM)"
              type="number"
              value={monthlyRental}
              onChange={(e) => setMonthlyRental(e.target.value)}
              placeholder="0.00"
              prefix="RM"
            />
            {rental > 0 && (
              <div className="rounded-xl bg-[#262018] border border-[#332c20] p-3 space-y-1.5">
                <p className="text-xs text-[#7c6f54] font-medium">Auto-calculated deposits</p>
                <div className="flex justify-between text-xs">
                  <span className="text-[#a89d84]">Security Deposit (2×)</span>
                  <span className="text-gold-400 font-medium">{formatCurrency(secDep)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#a89d84]">Utility Deposit (0.5×)</span>
                  <span className="text-gold-400 font-medium">{formatCurrency(utilDep)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-[#332c20] pt-1.5 mt-1">
                  <span className="text-[#f5f0e8] font-medium">Total</span>
                  <span className="text-gold-300 font-semibold">{formatCurrency(secDep + utilDep)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Check-out: utility statuses */}
        {type === 'checkout' && (
          <>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Utility Status</p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Electricity"
                value={electricityStatus}
                onChange={(e) => setElectricityStatus(e.target.value)}
                placeholder="Select…"
                options={UTILITY_OPTIONS}
              />
              <Select
                label="Water"
                value={waterStatus}
                onChange={(e) => setWaterStatus(e.target.value)}
                placeholder="Select…"
                options={UTILITY_OPTIONS}
              />
              <Select
                label="Indah Water"
                value={indahWaterStatus}
                onChange={(e) => setIndahWaterStatus(e.target.value)}
                placeholder="Select…"
                options={UTILITY_OPTIONS}
              />
              <Select
                label="Gas"
                value={gasStatus}
                onChange={(e) => setGasStatus(e.target.value)}
                placeholder="Select…"
                options={UTILITY_OPTIONS}
              />
            </div>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Refund Bank Details</p>
            <Input
              label="Account Holder"
              value={bankHolder}
              onChange={(e) => setBankHolder(e.target.value)}
              placeholder="Full name"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Bank Name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Maybank"
              />
              <Input
                label="Account No."
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="Account number"
              />
            </div>
          </>
        )}

        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes…"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>Add Record</Button>
        </div>
      </form>
    </Modal>
  )
}

function EditUnitModal({
  unit,
  open,
  onClose,
  onSaved,
}: {
  unit: Unit
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [building, setBuilding] = useState(unit.building)
  const [unitNumber, setUnitNumber] = useState(unit.unit_number)
  const [lister, setLister] = useState(unit.lister ?? '')
  const [notes, setNotes] = useState(unit.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!building || !unitNumber.trim()) { setError('Building and unit number are required.'); return }
    setLoading(true)
    setError('')
    try {
      await updateUnit(unit.id, {
        building,
        unit_number: unitNumber.trim(),
        lister: lister || null,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Unit">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Building"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          options={BUILDINGS.map((b) => ({ value: b, label: b }))}
        />
        <Input
          label="Unit Number"
          value={unitNumber}
          onChange={(e) => setUnitNumber(e.target.value)}
        />
        <Select
          label="Lister (agent who brought in this property)"
          value={lister}
          onChange={(e) => setLister(e.target.value)}
          placeholder="Select lister…"
          options={LISTER_OPTIONS.map((l) => ({ value: l, label: l }))}
        />
        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  )
}
