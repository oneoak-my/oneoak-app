'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Trash2, Plus,
  Search, X, ArrowUp, ArrowDown, Check,
} from 'lucide-react'
import {
  AREA_TEMPLATES, ALL_ITEMS, BRAND_OPTIONS, SIZE_OPTIONS,
  ACCESS_CARD_CHIPS, BEDROOM_KEY_CHIPS,
} from '@/lib/inventoryCatalog'
import type { CatalogItem, AreaTemplate } from '@/lib/inventoryCatalog'
import type { Inventory, AreaData, CustomItemSelection } from '@/lib/inventoryTypes'
import { getInventory, saveInventory, getBrands, addBrand } from '@/lib/inventoryApi'
import { downloadWord, downloadPdf } from '@/lib/inventoryExport'
import { supabase } from '@/lib/supabase'
import PhotosTab from '@/components/inventory/PhotosTab'

// ── Utility ───────────────────────────────────────────────────────────────────

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function totalTicked(areas: AreaData[]): number {
  return areas.reduce((s, a) => s + a.items.length, 0)
}

// ── Item row ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: CatalogItem
  sel: CustomItemSelection | null
  onTick: () => void
  onUntick: () => void
  onUpdate: (patch: Partial<CustomItemSelection>) => void
  customBrands: Record<string, string[]>
  onAddBrand: (group: string, name: string) => void
  bedroomAreaTitles: string[]
}

function ItemRow({ item, sel, onTick, onUntick, onUpdate, customBrands, onAddBrand, bedroomAreaTitles }: ItemRowProps) {
  const [showRemark, setShowRemark] = useState(false)
  const [brandTyping, setBrandTyping] = useState(false)
  const [brandInput, setBrandInput] = useState('')
  const [variantTyping, setVariantTyping] = useState(false)
  const [variantInput, setVariantInput] = useState('')
  const [customChipInput, setCustomChipInput] = useState('')
  const [showChipInput, setShowChipInput] = useState(false)

  const ticked = sel !== null

  function Stepper({ value, onChange }: { value: number | string; onChange: (v: number) => void }) {
    const n = typeof value === 'number' ? value : parseInt(String(value)) || 0
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, n - 1))}
          style={{ minHeight: '32px', minWidth: '32px', touchAction: 'manipulation' }}
          className="flex items-center justify-center rounded-lg bg-[#262018] border border-[#332c20] text-[#f5f0e8] hover:bg-[#2e2719] transition-colors text-base font-bold"
        >−</button>
        <span className="w-8 text-center text-sm text-[#f5f0e8] tabular-nums">{String(value)}</span>
        <button
          onClick={() => onChange(n + 1)}
          style={{ minHeight: '32px', minWidth: '32px', touchAction: 'manipulation' }}
          className="flex items-center justify-center rounded-lg bg-[#262018] border border-[#332c20] text-[#f5f0e8] hover:bg-[#2e2719] transition-colors text-base font-bold"
        >+</button>
      </div>
    )
  }

  const brandGroup = item.brandGroup as string | null | undefined
  const catalogBrands: string[] = brandGroup ? (BRAND_OPTIONS as Record<string, readonly string[]>)[brandGroup]?.slice() ?? [] : []
  const dbBrands: string[] = brandGroup ? (customBrands[brandGroup] ?? []) : []
  const allBrands = Array.from(new Set([...catalogBrands, ...dbBrands]))

  const variantOptions = item.variants.length > 1 ? item.variants : []

  function handleBrandSelect(val: string) {
    if (val === '__other__') { setBrandTyping(true); setBrandInput(''); return }
    onUpdate({ brand: val || undefined })
  }

  function commitBrand() {
    const name = brandInput.trim()
    if (name && brandGroup) { onAddBrand(brandGroup, name) }
    onUpdate({ brand: name || undefined })
    setBrandTyping(false)
  }

  function handleVariantSelect(val: string) {
    if (val === '__other__') { setVariantTyping(true); setVariantInput(''); return }
    onUpdate({ variant: val || undefined })
  }

  function commitVariant() {
    const v = variantInput.trim()
    onUpdate({ variant: v || undefined })
    setVariantTyping(false)
  }

  // Breakdown chips (access cards / bedroom keys)
  function getPartsFor(label: string): number {
    return sel?.parts?.find((p) => p.label === label)?.qty ?? 0
  }
  function setPart(label: string, qty: number) {
    const existing = sel?.parts?.filter((p) => p.label !== label) ?? []
    const newParts = qty > 0 ? [...existing, { label, qty }] : existing
    onUpdate({ parts: newParts, qty: newParts.reduce((s, p) => s + p.qty, 0) })
  }

  function addCustomChip() {
    const label = customChipInput.trim()
    if (!label) return
    setPart(label, 1)
    setCustomChipInput('')
    setShowChipInput(false)
  }

  const isBreakdownCards = item.kind === 'breakdown_cards'
  const isBreakdownRooms = item.kind === 'breakdown_rooms'
  const isLocation = item.kind === 'location'
  const isNotGiven = item.kind === 'notgiven'

  const bedroomChips: string[] = isBreakdownRooms
    ? Array.from(new Set([...BEDROOM_KEY_CHIPS, ...bedroomAreaTitles]))
    : []

  const displayLabel = sel?.variant || item.label

  return (
    <div className={`border-b border-[#332c20] last:border-0 ${ticked ? 'bg-[#1e1a14]' : ''}`}>
      {/* Tick row */}
      <button
        onClick={ticked ? onUntick : onTick}
        style={{ minHeight: '48px', touchAction: 'manipulation' }}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#1e1a14] transition-colors"
      >
        <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          ticked ? 'bg-gold-500 border-gold-500' : 'border-[#3d3628] bg-transparent'
        }`}>
          {ticked && <Check size={12} strokeWidth={3} className="text-[#0e0c08]" />}
        </div>
        <span className={`flex-1 text-left text-sm ${ticked ? 'text-[#f5f0e8]' : 'text-[#a89d84]'}`}>
          {displayLabel}
        </span>
        {ticked && <ChevronDown size={14} className="text-[#7c6f54] shrink-0" />}
      </button>

      {/* Expanded controls */}
      {ticked && sel && (
        <div className="px-3 pb-3 space-y-2.5">

          {/* Breakdown cards */}
          {isBreakdownCards && (
            <div className="space-y-1.5">
              {ACCESS_CARD_CHIPS.map((chip) => (
                <div key={chip} className="flex items-center justify-between">
                  <span className="text-xs text-[#a89d84] w-20">{chip}</span>
                  <Stepper value={getPartsFor(chip)} onChange={(v) => setPart(chip, v)} />
                </div>
              ))}
              {/* custom chips */}
              {(sel.parts ?? []).filter((p) => !(ACCESS_CARD_CHIPS as readonly string[]).includes(p.label)).map((p) => (
                <div key={p.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#a89d84] w-20">{p.label}</span>
                  <Stepper value={p.qty} onChange={(v) => setPart(p.label, v)} />
                </div>
              ))}
              {showChipInput ? (
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1 text-xs text-[#f5f0e8] focus:outline-none focus:border-gold-500/60"
                    placeholder="Label"
                    value={customChipInput}
                    onChange={(e) => setCustomChipInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addCustomChip() }}
                    autoFocus
                  />
                  <button onClick={addCustomChip} className="text-xs text-gold-400 px-2">Add</button>
                  <button onClick={() => setShowChipInput(false)} className="text-xs text-[#7c6f54] px-1">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowChipInput(true)} className="text-xs text-gold-400 flex items-center gap-1">
                  <Plus size={11} />Custom label
                </button>
              )}
            </div>
          )}

          {/* Breakdown rooms */}
          {isBreakdownRooms && (
            <div className="space-y-1.5">
              {bedroomChips.map((chip) => (
                <div key={chip} className="flex items-center justify-between">
                  <span className="text-xs text-[#a89d84] w-28 truncate">{chip}</span>
                  <Stepper value={getPartsFor(chip)} onChange={(v) => setPart(chip, v)} />
                </div>
              ))}
              {(sel.parts ?? []).filter((p) => !bedroomChips.includes(p.label)).map((p) => (
                <div key={p.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#a89d84] w-28 truncate">{p.label}</span>
                  <Stepper value={p.qty} onChange={(v) => setPart(p.label, v)} />
                </div>
              ))}
            </div>
          )}

          {/* Location */}
          {isLocation && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#a89d84]">Qty</span>
                <Stepper value={sel.qty} onChange={(v) => onUpdate({ qty: v })} />
              </div>
              <input
                className="w-full rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
                placeholder="Location detail (e.g. Level 2F | Lot 105)"
                value={sel.detail ?? ''}
                onChange={(e) => onUpdate({ detail: e.target.value })}
              />
            </div>
          )}

          {/* Not given */}
          {isNotGiven && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#a89d84]">Not given</span>
              <button
                onClick={() => onUpdate({ notGiven: !sel.notGiven, qty: sel.notGiven ? 1 : 0 })}
                style={{ touchAction: 'manipulation' }}
                className={`w-11 h-6 rounded-full transition-colors ${sel.notGiven ? 'bg-gold-500' : 'bg-[#332c20]'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5 ${sel.notGiven ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Standard qty item controls */}
          {!isBreakdownCards && !isBreakdownRooms && !isLocation && !isNotGiven && (
            <>
              {variantOptions.length > 0 && !variantTyping && (
                <div>
                  <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Type</label>
                  <select
                    value={sel.variant ?? ''}
                    onChange={(e) => handleVariantSelect(e.target.value)}
                    className="w-full rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] focus:outline-none focus:border-gold-500/60 appearance-none"
                  >
                    <option value="">— choose —</option>
                    {variantOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    <option value="__other__">Other… (type)</option>
                  </select>
                </div>
              )}
              {variantTyping && (
                <div>
                  <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Type</label>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      className="flex-1 rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] focus:outline-none focus:border-gold-500/60"
                      value={variantInput}
                      onChange={(e) => setVariantInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitVariant() }}
                    />
                    <button onClick={commitVariant} className="text-xs text-gold-400 px-2">OK</button>
                  </div>
                </div>
              )}

              {brandGroup && !brandTyping && (
                <div>
                  <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Brand</label>
                  <select
                    value={sel.brand ?? ''}
                    onChange={(e) => handleBrandSelect(e.target.value)}
                    className="w-full rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] focus:outline-none focus:border-gold-500/60 appearance-none"
                  >
                    <option value="">— choose —</option>
                    {allBrands.map((b) => <option key={b} value={b}>{b}</option>)}
                    <option value="__other__">Other… (type)</option>
                  </select>
                </div>
              )}
              {brandTyping && (
                <div>
                  <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Brand</label>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      className="flex-1 rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] focus:outline-none focus:border-gold-500/60"
                      placeholder="Brand name"
                      value={brandInput}
                      onChange={(e) => setBrandInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitBrand() }}
                    />
                    <button onClick={commitBrand} className="text-xs text-gold-400 px-2">Save</button>
                  </div>
                </div>
              )}

              {item.hasSize && (
                <div>
                  <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Size</label>
                  <select
                    value={sel.size ?? ''}
                    onChange={(e) => onUpdate({ size: e.target.value || undefined })}
                    className="w-full rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] focus:outline-none focus:border-gold-500/60 appearance-none"
                  >
                    <option value="">— choose —</option>
                    {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#a89d84]">Qty</span>
                <Stepper value={sel.qty} onChange={(v) => onUpdate({ qty: v })} />
              </div>
            </>
          )}

          {/* Remark (all types) */}
          {!isBreakdownCards && !isBreakdownRooms && (
            showRemark ? (
              <input
                autoFocus
                className="w-full rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
                placeholder="Remark (e.g. with existing stains on seat)"
                value={sel?.remarks ?? ''}
                onChange={(e) => onUpdate({ remarks: e.target.value })}
              />
            ) : (
              <button onClick={() => setShowRemark(true)} className="text-[10px] text-[#7c6f54] hover:text-gold-400 transition-colors">
                + Add remark
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Area card ─────────────────────────────────────────────────────────────────

interface AreaCardProps {
  area: AreaData
  areaIndex: number
  totalAreas: number
  customBrands: Record<string, string[]>
  onAddBrand: (group: string, name: string) => void
  onUpdate: (patch: Partial<AreaData>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  bedroomAreaTitles: string[]
}

function AreaCard({
  area, areaIndex, totalAreas, customBrands, onAddBrand,
  onUpdate, onRemove, onMoveUp, onMoveDown, bedroomAreaTitles,
}: AreaCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualLabel, setManualLabel] = useState('')
  const [manualQty, setManualQty] = useState('1')

  const template = AREA_TEMPLATES.find((t) => t.key === area.templateKey)
  const standardIds = template?.standardIds ?? []
  const allTemplateIds = template?.itemIds ?? []
  const moreIds = allTemplateIds.filter((id) => !standardIds.includes(id))

  // items in area that are NOT from the template (extras added via search / manual)
  const extraItems = area.items.filter(
    (it) => it.itemId === 'custom' || !allTemplateIds.includes(it.itemId),
  )

  function getSel(itemId: string): CustomItemSelection | null {
    return area.items.find((it) => it.itemId === itemId) ?? null
  }

  function tickItem(itemId: string) {
    const catalogItem = ALL_ITEMS[itemId]
    if (!catalogItem) return
    const newSel: CustomItemSelection = { itemId, qty: catalogItem.defaultQty }
    onUpdate({ items: [...area.items, newSel] })
  }

  function untickItem(itemId: string) {
    onUpdate({ items: area.items.filter((it) => it.itemId !== itemId) })
  }

  function updateItem(itemId: string, patch: Partial<CustomItemSelection>) {
    onUpdate({
      items: area.items.map((it) => it.itemId === itemId ? { ...it, ...patch } : it),
    })
  }

  function addFromSearch(itemId: string) {
    if (area.items.some((it) => it.itemId === itemId)) return
    const catalogItem = ALL_ITEMS[itemId]
    if (!catalogItem) return
    onUpdate({ items: [...area.items, { itemId, qty: catalogItem.defaultQty }] })
    setSearchQuery('')
    setShowSearch(false)
  }

  function addManual() {
    const label = manualLabel.trim()
    if (!label) return
    const newItem: CustomItemSelection = { itemId: 'custom', customLabel: label, qty: manualQty || '1' }
    onUpdate({ items: [...area.items, newItem] })
    setManualLabel('')
    setManualQty('1')
    setShowManual(false)
  }

  function removeExtra(idx: number) {
    // find this extra item in area.items
    const extra = extraItems[idx]
    if (!extra) return
    onUpdate({ items: area.items.filter((it) => it !== extra) })
  }

  const searchResults = searchQuery.length >= 2
    ? Object.values(ALL_ITEMS).filter(
        (it) =>
          !allTemplateIds.includes(it.id) &&
          !area.items.some((s) => s.itemId === it.id) &&
          it.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ).slice(0, 10)
    : []

  return (
    <div className="bg-[#141210] border border-[#332c20] rounded-2xl overflow-hidden">
      {/* Area header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#332c20]">
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{ touchAction: 'manipulation' }}
          className="flex-1 flex items-center gap-2 text-left"
        >
          {collapsed ? <ChevronRight size={16} className="text-[#7c6f54] shrink-0" /> : <ChevronDown size={16} className="text-[#7c6f54] shrink-0" />}
          <input
            value={area.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-sm font-semibold text-[#f5f0e8] focus:outline-none focus:border-b focus:border-gold-500/60 min-w-0"
          />
          {!collapsed && (
            <span className="text-[10px] text-[#7c6f54] shrink-0">{area.items.length} ticked</span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={areaIndex === 0}
            style={{ touchAction: 'manipulation', minHeight: '32px', minWidth: '28px' }}
            className="flex items-center justify-center text-[#7c6f54] hover:text-[#f5f0e8] disabled:opacity-30 transition-colors"
          >
            <ArrowUp size={13} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={areaIndex === totalAreas - 1}
            style={{ touchAction: 'manipulation', minHeight: '32px', minWidth: '28px' }}
            className="flex items-center justify-center text-[#7c6f54] hover:text-[#f5f0e8] disabled:opacity-30 transition-colors"
          >
            <ArrowDown size={13} />
          </button>
          <button
            onClick={onRemove}
            style={{ touchAction: 'manipulation', minHeight: '32px', minWidth: '28px' }}
            className="flex items-center justify-center text-[#7c6f54] hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {/* Standard items */}
          {standardIds.map((id) => {
            const item = ALL_ITEMS[id]
            if (!item) return null
            return (
              <ItemRow
                key={id}
                item={item}
                sel={getSel(id)}
                onTick={() => tickItem(id)}
                onUntick={() => untickItem(id)}
                onUpdate={(p) => updateItem(id, p)}
                customBrands={customBrands}
                onAddBrand={onAddBrand}
                bedroomAreaTitles={bedroomAreaTitles}
              />
            )
          })}

          {/* More items */}
          {moreIds.length > 0 && (
            <div>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                style={{ touchAction: 'manipulation', minHeight: '40px' }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#7c6f54] hover:text-[#a89d84] border-t border-[#332c20] transition-colors"
              >
                {moreOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                More items ({moreIds.length})
              </button>
              {moreOpen && moreIds.map((id) => {
                const item = ALL_ITEMS[id]
                if (!item) return null
                return (
                  <ItemRow
                    key={id}
                    item={item}
                    sel={getSel(id)}
                    onTick={() => tickItem(id)}
                    onUntick={() => untickItem(id)}
                    onUpdate={(p) => updateItem(id, p)}
                    customBrands={customBrands}
                    onAddBrand={onAddBrand}
                    bedroomAreaTitles={bedroomAreaTitles}
                  />
                )
              })}
            </div>
          )}

          {/* Extra items (added via search or manually) */}
          {extraItems.map((sel, idx) => {
            if (sel.itemId === 'custom') {
              return (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 border-t border-[#332c20]">
                  <div className="w-5 h-5 rounded border-2 border-gold-500 bg-gold-500 flex items-center justify-center shrink-0">
                    <Check size={12} strokeWidth={3} className="text-[#0e0c08]" />
                  </div>
                  <span className="flex-1 text-sm text-[#f5f0e8]">{sel.customLabel}</span>
                  <span className="text-xs text-[#7c6f54]">{String(sel.qty)}</span>
                  <button
                    onClick={() => removeExtra(idx)}
                    style={{ touchAction: 'manipulation' }}
                    className="text-[#7c6f54] hover:text-red-400 transition-colors p-1"
                  >
                    <X size={13} />
                  </button>
                </div>
              )
            }
            const item = ALL_ITEMS[sel.itemId]
            if (!item) return null
            return (
              <ItemRow
                key={sel.itemId}
                item={item}
                sel={sel}
                onTick={() => {}}
                onUntick={() => removeExtra(idx)}
                onUpdate={(p) => updateItem(sel.itemId, p)}
                customBrands={customBrands}
                onAddBrand={onAddBrand}
                bedroomAreaTitles={bedroomAreaTitles}
              />
            )
          })}

          {/* Add from another area */}
          <div className="border-t border-[#332c20] px-3 py-2 space-y-2">
            {showSearch ? (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7c6f54]" />
                  <input
                    autoFocus
                    className="w-full rounded-lg border border-[#332c20] bg-[#262018] pl-8 pr-3 py-1.5 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
                    placeholder="Search all items…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button onClick={() => { setShowSearch(false); setSearchQuery('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7c6f54]">
                    <X size={12} />
                  </button>
                </div>
                {searchResults.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => addFromSearch(it.id)}
                    style={{ touchAction: 'manipulation', minHeight: '36px' }}
                    className="w-full text-left text-xs text-[#a89d84] hover:text-[#f5f0e8] hover:bg-[#1e1a14] px-2 py-1.5 rounded-lg transition-colors"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                style={{ touchAction: 'manipulation', minHeight: '36px' }}
                className="flex items-center gap-1.5 text-xs text-[#7c6f54] hover:text-gold-400 transition-colors"
              >
                <Search size={12} />Add from another area
              </button>
            )}

            {showManual ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className="flex-1 rounded-lg border border-[#332c20] bg-[#262018] px-2.5 py-1.5 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
                    placeholder="Description"
                    value={manualLabel}
                    onChange={(e) => setManualLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addManual() }}
                  />
                  <input
                    className="w-16 rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1.5 text-xs text-[#f5f0e8] text-center focus:outline-none focus:border-gold-500/60"
                    placeholder="Qty"
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={addManual} className="text-xs text-gold-400 font-medium px-1">Add</button>
                  <button onClick={() => setShowManual(false)} className="text-xs text-[#7c6f54] px-1">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowManual(true)}
                style={{ touchAction: 'manipulation', minHeight: '36px' }}
                className="flex items-center gap-1.5 text-xs text-[#7c6f54] hover:text-gold-400 transition-colors"
              >
                <Plus size={12} />Type manually
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Area Bottom Sheet ─────────────────────────────────────────────────────

interface AddAreaSheetProps {
  open: boolean
  onClose: () => void
  onSelect: (template: AreaTemplate | null) => void
}

function AddAreaSheet({ open, onClose, onSelect }: AddAreaSheetProps) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-[#1e1a14] border-t border-[#332c20] rounded-t-2xl max-h-[80dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 border-b border-[#332c20] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[#f5f0e8]">Add area</h3>
          <button onClick={onClose} className="p-1.5 text-[#7c6f54] hover:text-[#f5f0e8]"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 py-2">
          {AREA_TEMPLATES.filter((t) => t.key !== 'meter').map((t) => (
            <button
              key={t.key}
              onClick={() => { onSelect(t); onClose() }}
              style={{ minHeight: '48px', touchAction: 'manipulation' }}
              className="w-full text-left px-4 py-3 hover:bg-[#262018] transition-colors"
            >
              <span className="text-sm text-[#f5f0e8]">{t.title}</span>
              <span className="text-xs text-[#7c6f54] ml-2">{t.standardIds.length} standard items</span>
            </button>
          ))}
          <button
            onClick={() => { onSelect(null); onClose() }}
            style={{ minHeight: '48px', touchAction: 'manipulation' }}
            className="w-full text-left px-4 py-3 hover:bg-[#262018] transition-colors border-t border-[#332c20]"
          >
            <span className="text-sm text-[#f5f0e8]">Custom area</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryEditorPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [addAreaOpen, setAddAreaOpen] = useState(false)
  const [customBrands, setCustomBrands] = useState<Record<string, string[]>>({})
  const [exporting, setExporting] = useState<'word' | 'pdf' | null>(null)
  const [tab, setTab] = useState<'checklist' | 'photos'>('checklist')

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inventoryRef = useRef<Inventory | null>(null)

  // Keep ref in sync for the debounce callback
  useEffect(() => { inventoryRef.current = inventory }, [inventory])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const inv = inventoryRef.current
      if (!inv) return
      setSaveStatus('saving')
      try {
        await saveInventory(inv.id, {
          heading: inv.heading,
          short_address: inv.short_address,
          inventory_date: inv.inventory_date,
          areas: inv.areas,
          include_meter_reading: inv.include_meter_reading,
        })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    }, 1000)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [inv, brands] = await Promise.all([getInventory(id), getBrands()])
        setInventory(inv)
        const grouped: Record<string, string[]> = {}
        for (const b of brands) {
          if (!grouped[b.brand_group]) grouped[b.brand_group] = []
          grouped[b.brand_group]!.push(b.name)
        }
        setCustomBrands(grouped)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    if (id) load()
  }, [id])

  // Ensure the supabase session is loaded for export user tracking
  useEffect(() => { supabase.auth.getSession() }, [])

  function patch(updates: Partial<Inventory>) {
    setInventory((prev) => prev ? { ...prev, ...updates } : prev)
    scheduleSave()
  }

  function patchAreas(newAreas: AreaData[]) { patch({ areas: newAreas }) }

  function addArea(template: AreaTemplate | null) {
    const newArea: AreaData = {
      id: uid(),
      templateKey: template?.key ?? 'custom',
      title: template?.title ?? 'Custom Area',
      items: [],
    }
    patchAreas([...(inventory?.areas ?? []), newArea])
  }

  function removeArea(areaId: string) {
    patchAreas((inventory?.areas ?? []).filter((a) => a.id !== areaId))
  }

  function moveArea(areaId: string, dir: -1 | 1) {
    const areas = [...(inventory?.areas ?? [])]
    const idx = areas.findIndex((a) => a.id === areaId)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= areas.length) return
    ;[areas[idx], areas[newIdx]] = [areas[newIdx]!, areas[idx]!]
    patchAreas(areas)
  }

  function updateArea(areaId: string, updates: Partial<AreaData>) {
    patchAreas((inventory?.areas ?? []).map((a) => a.id === areaId ? { ...a, ...updates } : a))
  }

  async function handleAddBrand(group: string, name: string) {
    try {
      await addBrand(group, name)
      setCustomBrands((prev) => ({
        ...prev,
        [group]: Array.from(new Set([...(prev[group] ?? []), name])).sort(),
      }))
    } catch (e) {
      console.error(e)
    }
  }

  async function handleWord() {
    if (!inventory) return
    setExporting('word')
    try { await downloadWord(inventory) } catch (e) { console.error(e) } finally { setExporting(null) }
  }

  async function handlePdf() {
    if (!inventory) return
    setExporting('pdf')
    try { await downloadPdf(inventory) } catch (e) { console.error(e) } finally { setExporting(null) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0c08] flex items-center justify-center">
        <p className="text-[#7c6f54] text-sm">Loading…</p>
      </div>
    )
  }

  if (!inventory) {
    return (
      <div className="min-h-screen bg-[#0e0c08] flex flex-col items-center justify-center gap-4">
        <p className="text-[#f5f0e8]">Inventory not found.</p>
        <button onClick={() => router.push('/inventory')} className="text-sm text-gold-400">← Back</button>
      </div>
    )
  }

  const bedroomAreaTitles = inventory.areas
    .filter((a) => a.templateKey === 'bedroom')
    .map((a) => a.title)

  const ticked = totalTicked(inventory.areas)

  return (
    <div className="min-h-screen bg-[#0e0c08] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0e0c08]/95 backdrop-blur border-b border-[#332c20] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/inventory')}
          style={{ minHeight: '44px', minWidth: '44px', touchAction: 'manipulation' }}
          className="flex items-center justify-center text-[#7c6f54] hover:text-[#f5f0e8] transition-colors -ml-1"
        >
          <ChevronRight size={20} className="rotate-180" />
        </button>
        <span className="text-[#f5f0e8] font-semibold text-sm flex-1 truncate">Inventory</span>
        {saveStatus === 'saving' && <span className="text-[10px] text-[#7c6f54]">Saving…</span>}
        {saveStatus === 'saved' && <span className="text-[10px] text-emerald-400">Saved ✓</span>}
        <button
          onClick={handleWord}
          disabled={exporting !== null}
          style={{ touchAction: 'manipulation' }}
          className="text-xs text-[#a89d84] hover:text-[#f5f0e8] transition-colors px-2 py-1 rounded-lg hover:bg-[#1e1a14] disabled:opacity-50"
        >
          {exporting === 'word' ? '…' : '📝 Word'}
        </button>
        <button
          onClick={handlePdf}
          disabled={exporting !== null}
          style={{ touchAction: 'manipulation' }}
          className="text-xs text-[#a89d84] hover:text-[#f5f0e8] transition-colors px-2 py-1 rounded-lg hover:bg-[#1e1a14] disabled:opacity-50"
        >
          {exporting === 'pdf' ? '…' : '📄 PDF'}
        </button>
      </div>

      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-4">
        {/* Address + short address + date */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Address</label>
            <input
              className="w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
              placeholder="e.g. A-27-09 Ooak Residence, Jalan Kiara 5, 50480 Mont Kiara, Kuala Lumpur"
              value={inventory.heading ?? ''}
              onChange={(e) => patch({ heading: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Short Address</label>
            <input
              className="w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
              placeholder="e.g. A-27-09 Ooak Residence"
              value={inventory.short_address ?? ''}
              onChange={(e) => patch({ short_address: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[10px] text-[#7c6f54] uppercase tracking-wider mb-1 block">Date</label>
            <input
              type="date"
              className="rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] focus:outline-none focus:border-gold-500/60"
              value={inventory.inventory_date ?? ''}
              onChange={(e) => patch({ inventory_date: e.target.value })}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-[#141210] border border-[#332c20] p-1">
          {(['checklist', 'photos'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ touchAction: 'manipulation', minHeight: '40px' }}
              className={`flex-1 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-[#262018] text-[#f5f0e8]' : 'text-[#7c6f54] hover:text-[#a89d84]'
              }`}
            >
              {t === 'checklist' ? 'Checklist' : 'Photos'}
            </button>
          ))}
        </div>

        {tab === 'photos' && <PhotosTab inventory={inventory} />}

        {tab === 'checklist' && (<>
        {/* Item counter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gold-400">{ticked} items ticked</span>
        </div>

        {/* Areas */}
        <div className="space-y-3">
          {inventory.areas.map((area, idx) => (
            <AreaCard
              key={area.id}
              area={area}
              areaIndex={idx}
              totalAreas={inventory.areas.length}
              customBrands={customBrands}
              onAddBrand={handleAddBrand}
              onUpdate={(p) => updateArea(area.id, p)}
              onRemove={() => removeArea(area.id)}
              onMoveUp={() => moveArea(area.id, -1)}
              onMoveDown={() => moveArea(area.id, 1)}
              bedroomAreaTitles={bedroomAreaTitles}
            />
          ))}
        </div>

        {/* Add area */}
        <button
          onClick={() => setAddAreaOpen(true)}
          style={{ touchAction: 'manipulation', minHeight: '48px' }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#332c20] hover:border-[#3d3628] text-[#7c6f54] hover:text-[#a89d84] text-sm transition-colors py-3"
        >
          <Plus size={16} />Add area
        </button>

        {/* Meter reading toggle */}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-[#a89d84]">Include meter reading section</span>
          <button
            onClick={() => patch({ include_meter_reading: !inventory.include_meter_reading })}
            style={{ touchAction: 'manipulation' }}
            className={`w-11 h-6 rounded-full transition-colors shrink-0 ${inventory.include_meter_reading ? 'bg-gold-500' : 'bg-[#332c20]'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5 ${inventory.include_meter_reading ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        </>)}
      </div>

      <AddAreaSheet
        open={addAreaOpen}
        onClose={() => setAddAreaOpen(false)}
        onSelect={addArea}
      />
    </div>
  )
}
