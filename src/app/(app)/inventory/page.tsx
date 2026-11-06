'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ClipboardList } from 'lucide-react'
import { getInventories, createInventory, deleteInventory } from '@/lib/inventoryApi'
import { getUnits } from '@/lib/api'
import type { Inventory } from '@/lib/inventoryTypes'
import type { Unit } from '@/lib/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import { Trash2 } from 'lucide-react'

function countItems(inv: Inventory): number {
  return (inv.areas ?? []).reduce((sum, a) => sum + (a.items?.length ?? 0), 0)
}

function fmtDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function InventoryListPage() {
  const router = useRouter()
  const [inventories, setInventories] = useState<Inventory[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newUnitId, setNewUnitId] = useState('')
  const [newHeading, setNewHeading] = useState('')
  const [newShortAddress, setNewShortAddress] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [invs, us] = await Promise.all([getInventories(), getUnits()])
      setInventories(invs)
      setUnits(us)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleUnitChange(unitId: string) {
    setNewUnitId(unitId)
    if (unitId) {
      const u = units.find((u) => u.id === unitId)
      if (u) {
        setNewHeading(`${u.unit_number}, ${u.building}`)
        setNewShortAddress(`${u.unit_number} ${u.building}`)
      }
    } else {
      setNewHeading('')
      setNewShortAddress('')
    }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const inv = await createInventory({
        unit_id: newUnitId || null,
        heading: newHeading || null,
        short_address: newShortAddress || null,
        inventory_date: new Date().toISOString().split('T')[0],
        areas: [],
        include_meter_reading: false,
      })
      router.push(`/inventory/${inv.id}`)
    } catch (e) {
      console.error(e)
      setCreating(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this inventory list?')) return
    setDeletingId(id)
    try {
      await deleteInventory(id)
      setInventories((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const unitOptions = [
    { value: '', label: 'No unit (standalone)' },
    ...units.map((u) => ({ value: u.id, label: `${u.unit_number} — ${u.building}` })),
  ]

  return (
    <div className="min-h-screen bg-[#0e0c08] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0e0c08]/95 backdrop-blur border-b border-[#1e1a14] px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#f5f0e8]">Inventory Lists</h1>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => { setNewUnitId(''); setNewHeading(''); setNewShortAddress(''); setShowNew(true) }}
        >
          New Inventory
        </Button>
      </div>

      <div className="px-4 pt-4 space-y-3 max-w-2xl mx-auto">
        {loading && (
          <div className="text-center text-[#7c6f54] py-16 text-sm">Loading…</div>
        )}

        {!loading && inventories.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={36} className="text-[#7c6f54]" />}
            title="No inventory lists yet"
            description={'Tap "+ New Inventory" to create your first one.'}
          />
        )}

        {inventories.map((inv) => (
          <button
            key={inv.id}
            onClick={() => router.push(`/inventory/${inv.id}`)}
            style={{ touchAction: 'manipulation', minHeight: '64px' }}
            className="w-full text-left bg-[#1e1a14] border border-[#332c20] rounded-2xl px-4 py-3.5 hover:border-[#3d3628] transition-colors active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[#f5f0e8] font-medium text-sm leading-snug truncate">
                  {inv.heading || 'Untitled'}
                </p>
                <p className="text-[#7c6f54] text-xs mt-1">
                  {fmtDate(inv.inventory_date)} · {countItems(inv)} items ticked
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(inv.id, e)}
                disabled={deletingId === inv.id}
                style={{ minHeight: '36px', minWidth: '36px', touchAction: 'manipulation' }}
                className="shrink-0 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-[#7c6f54] hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </button>
        ))}
      </div>

      {/* New Inventory Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Inventory" size="sm">
        <div className="space-y-4">
          <Select
            label="Unit (optional)"
            options={unitOptions}
            value={newUnitId}
            onChange={(e) => handleUnitChange(e.target.value)}
          />
          <Input
            label="Address"
            placeholder="e.g. A-27-09 Ooak Residence, Jalan Kiara 5, 50480 Mont Kiara, Kuala Lumpur"
            value={newHeading}
            onChange={(e) => setNewHeading(e.target.value)}
          />
          <Button
            variant="primary"
            fullWidth
            loading={creating}
            onClick={handleCreate}
            disabled={!newHeading.trim()}
          >
            Create & Open
          </Button>
        </div>
      </Modal>
    </div>
  )
}
