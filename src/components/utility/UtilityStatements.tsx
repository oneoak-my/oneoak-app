'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Droplets, FileText, Image as ImageIcon, Loader2, Plus, Upload, X, Zap } from 'lucide-react'
import {
  createService, createServiceProvider, extractError, getRecord, updateRecord, updateService, uploadInvoice,
} from '@/lib/api'
import { compressImage } from '@/lib/imageCompress'
import { computeMeterRequest, meterBaseDate } from '@/lib/meterEmail'
import { extractPdfLines } from '@/lib/pdfText'
import type { PaymentBy, PropertyRecord, ServiceProvider, Unit } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  DOC_TYPE_LABELS, ELEC_PROVIDER, ELEC_SERVICE, MAX_UTILITY_FILES, MAX_UTILITY_FILE_BYTES, UTILITY_BUILDINGS,
  WATER_SERVICE, buildPlan, docPeriod, docUnit, emptyDoc, missingFields, unitsMatch, waterProviderFor,
  type UtilityDoc, type UtilityDocType, type UtilityOutcome,
  type WaterInvoiceData, type WaterStatementData, type YnhInvoiceData, type YnhStatementData,
} from '@/lib/utilityDocs'
import { parseAs, parseUtilityText } from '@/lib/utilityParsers'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'

type Item = {
  id: string
  name: string
  /** What gets uploaded on Apply: the original PDF, or the compressed JPEG for images. */
  file: File
  previewUrl: string | null
  /** Extracted PDF text lines (null for images). Kept so a type change can re-parse. */
  lines: string[] | null
  status: 'reading' | 'done'
  doc: UtilityDoc
  parseWarnings: string[]
  editing: boolean
  /** Include despite a unit mismatch. */
  useAnyway: boolean
}

const SELECTABLE_TYPES: UtilityDocType[] = ['water_statement', 'water_invoice', 'water_meter_photo', 'ynh_invoice', 'ynh_statement', 'unknown']

const fieldCls =
  'w-full rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1.5 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60'

function rm(n: number) {
  return `RM ${n.toFixed(2)}`
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** Shown only on check-in / check-out records of Ooak Residence and Ooak Suites. */
export default function UtilityStatements(props: {
  record: PropertyRecord
  providers: ServiceProvider[]
  onApplied: () => void
}) {
  const { record } = props
  const unit = record.unit
  if (!unit || !UTILITY_BUILDINGS.includes(unit.building)) return null
  if (record.type !== 'checkin' && record.type !== 'checkout') return null
  return <UtilityStatementsCard {...props} unit={unit} recordType={record.type} />
}

function UtilityStatementsCard({
  record, unit, recordType, providers, onApplied,
}: {
  record: PropertyRecord
  unit: Unit
  recordType: 'checkin' | 'checkout'
  providers: ServiceProvider[]
  onApplied: () => void
}) {
  const isCheckIn = recordType === 'checkin'
  const eventDate = meterBaseDate(record)
  const plannedDate = computeMeterRequest(recordType, eventDate).requestDate

  const [items, setItems] = useState<Item[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [elecDate, setElecDate] = useState(plannedDate)
  const [elecReading, setElecReading] = useState('')
  const [waterReading, setWaterReading] = useState('')
  const [tenancyStart, setTenancyStart] = useState(record.tenancy_start_date ?? '')
  const [applying, setApplying] = useState(false)
  const [applyMsg, setApplyMsg] = useState('')
  const [applyErr, setApplyErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<Item[]>([])
  itemsRef.current = items

  // Revoke thumbnails on unmount.
  useEffect(() => () => itemsRef.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl)), [])

  const patch = (id: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)))

  function editDoc(id: string, mutate: (doc: UtilityDoc) => void) {
    setItems((prev) => prev.map((i) => {
      if (i.id !== id) return i
      const doc = clone(i.doc)
      mutate(doc)
      return { ...i, doc }
    }))
  }

  async function addFiles(list: FileList | File[]) {
    setApplyMsg('')
    setApplyErr('')
    const room = MAX_UTILITY_FILES - itemsRef.current.length
    const incoming = Array.from(list).slice(0, Math.max(0, room))
    for (const f of incoming) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      const isImage = f.type.startsWith('image/')
      const base: Item = {
        id, name: f.name, file: f, previewUrl: null, lines: null, status: 'reading',
        doc: emptyDoc('unknown'), parseWarnings: [], editing: false, useAnyway: false,
      }
      if ((!isPdf && !isImage) || f.size > MAX_UTILITY_FILE_BYTES) {
        setItems((prev) => [...prev, {
          ...base, status: 'done',
          parseWarnings: [!isPdf && !isImage ? 'Only PDF and image files can be attached' : 'Larger than 10 MB: not attached'],
        }])
        continue
      }
      setItems((prev) => [...prev, base])

      if (isImage) {
        // Photos are attached as files only; the reading is typed in the box below.
        try {
          const { blob } = await compressImage(f)
          const file = new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
          patch(id, { file, previewUrl: URL.createObjectURL(file), status: 'done', doc: emptyDoc('water_meter_photo') })
        } catch {
          patch(id, { status: 'done', doc: emptyDoc('water_meter_photo'), parseWarnings: ['Could not shrink this image: the original will be attached'] })
        }
        continue
      }

      const file = new File([f], f.name, { type: 'application/pdf' })
      try {
        const lines = await extractPdfLines(await f.arrayBuffer())
        const { doc, warnings } = parseUtilityText(lines)
        patch(id, { file, lines, status: 'done', doc, parseWarnings: warnings, editing: missingFields(doc).length > 0 || doc.type === 'unknown' })
      } catch (e) {
        patch(id, {
          file, status: 'done', doc: emptyDoc('unknown'),
          parseWarnings: [`Could not open this PDF (${extractError(e)}): choose its type and type the numbers in`],
          editing: true,
        })
      }
    }
  }

  function changeType(id: string, type: UtilityDocType) {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    const { doc, warnings } = item.lines ? parseAs(type, item.lines) : { doc: emptyDoc(type), warnings: [] }
    patch(id, { doc, parseWarnings: warnings, editing: type !== 'water_meter_photo' && type !== 'unknown' })
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((i) => i.id !== id)
    })
  }

  const docs = useMemo(
    () => items.filter((i) => i.status === 'done').map((i) => ({ id: i.id, name: i.name, doc: i.doc, useAnyway: i.useAnyway })),
    [items],
  )
  const numOrNull = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))

  const plan = useMemo(
    () =>
      buildPlan({
        recordType,
        unitNo: unit.unit_number,
        dualKey: !!unit.dual_key,
        eventDate,
        tenancyStart: tenancyStart || null,
        docs,
        elecReading: numOrNull(elecReading),
        elecReadingDate: elecDate || plannedDate,
        photoReading: numOrNull(waterReading),
      }),
    [recordType, unit.unit_number, unit.dual_key, eventDate, tenancyStart, docs, elecReading, elecDate, plannedDate, waterReading],
  )

  const photoItem = items.find((i) => i.id === plan.photoDocId)
  const busy = items.some((i) => i.status === 'reading')
  const hasWater = !!plan.water && !('error' in plan.water)
  const hasElec = !!plan.elec && !('error' in plan.elec)

  async function ensureProvider(name: string): Promise<string> {
    const found = providers.find((p) => p.name.trim().toLowerCase() === name.toLowerCase())
    if (found) return found.id
    return (await createServiceProvider({ name })).id
  }

  async function apply() {
    setApplying(true)
    setApplyMsg('')
    setApplyErr('')
    try {
      // Re-read services so a second Apply updates instead of duplicating.
      const fresh = await getRecord(record.id)
      const services = fresh?.services ?? []
      const done: string[] = []
      const statusUpdates: Partial<PropertyRecord> = {}

      const jobs: { outcome: UtilityOutcome; description: string; provider: string; statusKey: 'water_status' | 'electricity_status' }[] = [
        { outcome: plan.water, description: WATER_SERVICE, provider: waterProviderFor(unit.building), statusKey: 'water_status' },
        { outcome: plan.elec, description: ELEC_SERVICE, provider: ELEC_PROVIDER, statusKey: 'electricity_status' },
      ]

      for (const job of jobs) {
        const o = job.outcome
        if (!o || 'error' in o) continue
        if (!isCheckIn) statusUpdates[job.statusKey] = o.amount > 0 ? 'Have Outstanding' : 'No Outstanding'

        const existing = services.find((s) => s.description === job.description)
        if (!existing && o.amount === 0) {
          done.push(`${job.description}: nothing outstanding, no service added`)
          continue
        }
        const providerId = await ensureProvider(job.provider)
        const fields = { description: job.description, provider_id: providerId, amount: o.amount, notes: o.note }

        let serviceId: string
        if (existing) {
          await updateService(existing.id, fields) // payment_by kept as is
          serviceId = existing.id
        } else {
          const paymentBy: PaymentBy = isCheckIn ? 'Pay by Owner' : 'Deduct from Deposit'
          serviceId = (await createService({ ...fields, record_id: record.id, payment_by: paymentBy })).id
        }

        // Fixed slots per document type; slots with no new file keep their current attachment.
        const urls: (string | null)[] = [existing?.invoice_url ?? null, existing?.invoice_url_2 ?? null, existing?.invoice_url_3 ?? null]
        for (let i = 0; i < 3; i++) {
          const docId = o.slots[i]
          const item = docId ? items.find((it) => it.id === docId) : undefined
          if (!item) continue
          const url = await uploadInvoice(item.file, serviceId, (i + 1) as 1 | 2 | 3)
          urls[i] = `${url}?v=${Date.now()}` // same storage path on re-apply: bust the cache
        }
        await updateService(serviceId, { invoice_url: urls[0], invoice_url_2: urls[1], invoice_url_3: urls[2] })
        done.push(`${job.description}: ${rm(o.amount)} ${existing ? 'updated' : 'added'}`)
      }

      if (Object.keys(statusUpdates).length) await updateRecord(record.id, statusUpdates)
      setApplyMsg(done.join(' · ') || 'Nothing to apply')
      onApplied()
    } catch (e) {
      setApplyErr(extractError(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">Utility statements</p>
        <span className="text-[11px] text-[#7c6f54]">
          {unit.building}{unit.dual_key ? ' · Dual-key' : ''}
        </span>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-gold-500/60 bg-gold-500/10' : 'border-[#332c20] bg-[#181410] hover:bg-[#262018]'
        }`}
      >
        <Upload size={18} className="text-gold-400" />
        <p className="text-sm text-[#f5f0e8]">Drop statements, invoices and meter photos</p>
        <p className="text-[11px] text-[#7c6f54]">or tap to choose · PDF or image · up to {MAX_UTILITY_FILES} files, 10 MB each · read on this device</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Files */}
      {items.length > 0 && (
        <div className="rounded-xl border border-[#332c20] divide-y divide-[#332c20] overflow-hidden">
          {items.map((i) => (
            <FileRow
              key={i.id}
              item={i}
              excluded={plan.excluded.includes(i.id)}
              recordUnit={unit.unit_number}
              onUseAnyway={(v) => patch(i.id, { useAnyway: v })}
              onType={(t) => changeType(i.id, t)}
              onToggle={() => patch(i.id, { editing: !i.editing })}
              onRemove={() => removeItem(i.id)}
              onEdit={(mutate) => editDoc(i.id, mutate)}
            />
          ))}
        </div>
      )}

      {/* Typed readings: always visible */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-end">
          <Input
            label={`Electricity meter reading as of ${formatDate(elecDate || plannedDate)} (kWh)`}
            type="number"
            inputMode="decimal"
            value={elecReading}
            onChange={(e) => setElecReading(e.target.value)}
            placeholder="From the YNH email"
          />
          <Input label="Reading date" type="date" value={elecDate} onChange={(e) => setElecDate(e.target.value)} />
        </div>

        {!isCheckIn && (
          <div className="flex items-end gap-3">
            {photoItem?.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoItem.previewUrl} alt="Water meter" className="h-20 w-20 shrink-0 rounded-lg object-cover border border-[#332c20]" />
            )}
            <div className="flex-1">
              <Input
                label="Water meter reading (m3)"
                type="number"
                inputMode="numeric"
                value={waterReading}
                onChange={(e) => setWaterReading(e.target.value)}
                placeholder="White/black drums only"
              />
            </div>
          </div>
        )}

        {!isCheckIn ? (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tenancy start" type="date" value={tenancyStart} onChange={(e) => setTenancyStart(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#a89d84]">Move-out date</span>
              <span className="px-3 py-2.5 text-sm text-[#f5f0e8]">{formatDate(eventDate)}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#7c6f54]">Move-in date: <span className="text-[#a89d84]">{formatDate(eventDate)}</span></p>
        )}
      </div>

      {items.length > 0 && (
        <>
          <ResultBlock icon={<Droplets size={14} />} title="Water" outcome={plan.water} />
          <ResultBlock icon={<Zap size={14} />} title="Electricity" outcome={plan.elec} />

          {plan.warnings.length > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/20 px-3 py-2.5 space-y-1">
              {plan.warnings.map((w, k) => (
                <p key={k} className="flex gap-2 text-xs text-orange-300">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}

          {applyErr && <p className="text-sm text-red-400">{applyErr}</p>}
          {applyMsg && (
            <p className="flex gap-2 text-xs text-emerald-300">
              <Check size={13} className="shrink-0 mt-0.5" /> <span>{applyMsg}</span>
            </p>
          )}

          <Button variant="primary" fullWidth loading={applying} disabled={busy || (!hasWater && !hasElec)} onClick={apply}>
            Apply to record
          </Button>
        </>
      )}
    </Card>
  )
}

// ── File row with type selector and editable fields ──────────────────────────

function FileRow({
  item, excluded, recordUnit, onUseAnyway, onType, onToggle, onRemove, onEdit,
}: {
  item: Item
  excluded: boolean
  recordUnit: string
  onUseAnyway: (v: boolean) => void
  onType: (t: UtilityDocType) => void
  onToggle: () => void
  onRemove: () => void
  onEdit: (mutate: (doc: UtilityDoc) => void) => void
}) {
  const { doc } = item
  const missing = item.status === 'done' ? missingFields(doc) : []
  const u = docUnit(doc)
  const editable = doc.type !== 'unknown' && doc.type !== 'water_meter_photo'
  const Icon = item.previewUrl ? ImageIcon : FileText

  return (
    <div className="px-3 py-2.5 bg-[#1e1a14] space-y-2">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-1">
          {item.status === 'reading'
            ? <Loader2 size={15} className="text-gold-400 animate-spin" />
            : <Icon size={15} className={excluded || missing.length || doc.type === 'unknown' ? 'text-orange-300' : 'text-[#a89d84]'} />}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <select
            value={doc.type}
            disabled={item.status === 'reading'}
            onChange={(e) => onType(e.target.value as UtilityDocType)}
            aria-label={`Type of ${item.name}`}
            className="max-w-full rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1 text-xs font-medium text-[#f5f0e8] focus:outline-none focus:border-gold-500/60"
          >
            {SELECTABLE_TYPES.map((t) => <option key={t} value={t} className="bg-[#1e1a14] text-[#f5f0e8]">{DOC_TYPE_LABELS[t]}</option>)}
          </select>
          <p className="text-[11px] text-[#7c6f54] truncate">
            {item.status === 'reading' ? 'Reading…' : [u ? `Unit ${u}` : null, docPeriod(doc), item.name].filter(Boolean).join(' · ')}
          </p>
          {excluded && (
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-orange-300">
              <span>Unit {u} does not match {recordUnit}: not used</span>
              <button type="button" onClick={() => onUseAnyway(true)}
                className="font-semibold text-gold-400 hover:text-gold-300 underline underline-offset-2">
                Use anyway
              </button>
            </p>
          )}
          {item.useAnyway && u && !unitsMatch(u, recordUnit) && (
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-orange-300">
              <span>Unit {u} does not match {recordUnit}: used anyway</span>
              <button type="button" onClick={() => onUseAnyway(false)}
                className="font-semibold text-gold-400 hover:text-gold-300 underline underline-offset-2">
                Undo
              </button>
            </p>
          )}
          {[...item.parseWarnings, ...(missing.length ? [`Missing: ${missing.join(', ')}`] : [])].map((w, k) => (
            <p key={k} className="text-[11px] text-orange-300">{w}</p>
          ))}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {editable && (
            <button type="button" onClick={onToggle} aria-label={item.editing ? 'Hide fields' : 'Edit fields'}
              className="p-1 text-[#7c6f54] hover:text-[#f5f0e8] transition-colors">
              {item.editing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`}
            className="p-1 text-[#7c6f54] hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
      {editable && item.editing && <DocEditor doc={doc} onEdit={onEdit} />}
    </div>
  )
}

// ── Small field inputs ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-[#7c6f54]">{label}</span>
      {children}
    </label>
  )
}

function TextField({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return <input className={fieldCls} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)} />
}

function DateField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return <input type="date" className={fieldCls} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
}

/** Keeps the typed text (e.g. "12.") while committing the parsed number. */
function NumField({ value, onChange, scale = 1 }: { value: number | null; onChange: (v: number | null) => void; scale?: number }) {
  const shown = value == null ? '' : String(Math.round(value * scale * 1e6) / 1e6)
  const [text, setText] = useState(shown)
  useEffect(() => {
    if (Number(text) !== Number(shown) || (text === '') !== (shown === '')) setText(shown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])
  return (
    <input
      className={fieldCls}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/,/g, '')
        setText(t)
        const n = t.trim() === '' ? null : Number(t)
        if (n == null || Number.isFinite(n)) onChange(n == null ? null : n / scale)
      }}
    />
  )
}

function RowButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-400 hover:text-gold-300 transition-colors">
      {children}
    </button>
  )
}

// ── Editors per document type ────────────────────────────────────────────────

function DocEditor({ doc, onEdit }: { doc: UtilityDoc; onEdit: (mutate: (doc: UtilityDoc) => void) => void }) {
  const grid = 'grid grid-cols-2 sm:grid-cols-3 gap-2'

  if (doc.type === 'water_statement') {
    const set = (f: (d: WaterStatementData) => void) => onEdit((x) => { if (x.type === 'water_statement') f(x.data) })
    return (
      <div className="rounded-lg border border-[#332c20] bg-[#181410] p-2.5 space-y-2.5">
        <div className={grid}>
          <Field label="Unit"><TextField value={doc.data.unitNo} onChange={(v) => set((d) => { d.unitNo = v })} /></Field>
          <Field label="Statement date"><DateField value={doc.data.statementDate} onChange={(v) => set((d) => { d.statementDate = v })} /></Field>
          <Field label="Printed total (RM)"><NumField value={doc.data.printedTotal} onChange={(v) => set((d) => { d.printedTotal = v })} /></Field>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-[#7c6f54]">Rows: period, amount, paid, outstanding</p>
        {doc.data.rows.map((r, k) => (
          <div key={k} className="grid grid-cols-3 sm:grid-cols-7 gap-1.5 items-end border-t border-[#332c20] pt-2">
            <Field label="Invoice"><TextField value={r.invoiceNo} onChange={(v) => set((d) => { d.rows[k].invoiceNo = v ?? '' })} /></Field>
            <Field label="From"><DateField value={r.periodStart} onChange={(v) => set((d) => { d.rows[k].periodStart = v ?? '' })} /></Field>
            <Field label="To"><DateField value={r.periodEnd} onChange={(v) => set((d) => { d.rows[k].periodEnd = v ?? '' })} /></Field>
            <Field label="Amount"><NumField value={r.amount} onChange={(v) => set((d) => { d.rows[k].amount = v ?? 0 })} /></Field>
            <Field label="Paid"><NumField value={r.paid} onChange={(v) => set((d) => { d.rows[k].paid = v ?? 0 })} /></Field>
            <Field label="Outstanding"><NumField value={r.outstanding} onChange={(v) => set((d) => { d.rows[k].outstanding = v ?? 0 })} /></Field>
            <div className="pb-1.5">
              <RowButton label="Remove row" onClick={() => set((d) => { d.rows.splice(k, 1) })}><X size={13} /></RowButton>
            </div>
          </div>
        ))}
        <RowButton label="Add row" onClick={() => set((d) => {
          d.rows.push({ invoiceNo: '', invoiceDate: null, periodStart: '', periodEnd: '', amount: 0, paid: 0, outstanding: 0 })
        })}>
          <Plus size={12} /> Add row
        </RowButton>
      </div>
    )
  }

  if (doc.type === 'water_invoice') {
    const set = (f: (d: WaterInvoiceData) => void) => onEdit((x) => { if (x.type === 'water_invoice') f(x.data) })
    const d = doc.data
    return (
      <div className={`rounded-lg border border-[#332c20] bg-[#181410] p-2.5 ${grid}`}>
        <Field label="Unit"><TextField value={d.unitNo} onChange={(v) => set((x) => { x.unitNo = v })} /></Field>
        <Field label="Invoice no"><TextField value={d.invoiceNo} onChange={(v) => set((x) => { x.invoiceNo = v })} /></Field>
        <Field label="Total (RM)"><NumField value={d.total} onChange={(v) => set((x) => { x.total = v })} /></Field>
        <Field label="Period from"><DateField value={d.periodStart} onChange={(v) => set((x) => { x.periodStart = v })} /></Field>
        <Field label="Period to"><DateField value={d.periodEnd} onChange={(v) => set((x) => { x.periodEnd = v })} /></Field>
        <Field label="Previous reading"><NumField value={d.previousReading} onChange={(v) => set((x) => { x.previousReading = v })} /></Field>
        <Field label="Current reading"><NumField value={d.currentReading} onChange={(v) => set((x) => { x.currentReading = v })} /></Field>
      </div>
    )
  }

  if (doc.type === 'ynh_invoice') {
    const set = (f: (d: YnhInvoiceData) => void) => onEdit((x) => { if (x.type === 'ynh_invoice') f(x.data) })
    const d = doc.data
    return (
      <div className={`rounded-lg border border-[#332c20] bg-[#181410] p-2.5 ${grid}`}>
        <Field label="Unit"><TextField value={d.unitNo} onChange={(v) => set((x) => { x.unitNo = v })} /></Field>
        <Field label="Period from"><DateField value={d.periodStart} onChange={(v) => set((x) => { x.periodStart = v })} /></Field>
        <Field label="Period to"><DateField value={d.periodEnd} onChange={(v) => set((x) => { x.periodEnd = v })} /></Field>
        <Field label="Previous (kWh)"><NumField value={d.previousReading} onChange={(v) => set((x) => { x.previousReading = v })} /></Field>
        <Field label="Current (kWh)"><NumField value={d.currentReading} onChange={(v) => set((x) => { x.currentReading = v })} /></Field>
        <Field label="Consumption (kWh)"><NumField value={d.kwh} onChange={(v) => set((x) => { x.kwh = v })} /></Field>
        <Field label="Energy rate"><NumField value={d.rates.energy} onChange={(v) => set((x) => { x.rates.energy = v })} /></Field>
        <Field label="Capacity rate"><NumField value={d.rates.capacity} onChange={(v) => set((x) => { x.rates.capacity = v })} /></Field>
        <Field label="Network rate"><NumField value={d.rates.network} onChange={(v) => set((x) => { x.rates.network = v })} /></Field>
        <Field label="AFA rate"><NumField value={d.rates.afa} onChange={(v) => set((x) => { x.rates.afa = v })} /></Field>
        <Field label="Retail (RM)"><NumField value={d.retailCharge} onChange={(v) => set((x) => { x.retailCharge = v })} /></Field>
        <Field label="RE %"><NumField value={d.rePct} scale={100} onChange={(v) => set((x) => { x.rePct = v })} /></Field>
        <Field label="Outstanding (RM)"><NumField value={d.outstanding} onChange={(v) => set((x) => { x.outstanding = v })} /></Field>
        <Field label="Current charges (RM)"><NumField value={d.currentCharges} onChange={(v) => set((x) => { x.currentCharges = v })} /></Field>
        <Field label="Payable total (RM)"><NumField value={d.payableTotal} onChange={(v) => set((x) => { x.payableTotal = v })} /></Field>
      </div>
    )
  }

  if (doc.type === 'ynh_statement') {
    const set = (f: (d: YnhStatementData) => void) => onEdit((x) => { if (x.type === 'ynh_statement') f(x.data) })
    return (
      <div className="rounded-lg border border-[#332c20] bg-[#181410] p-2.5 space-y-2.5">
        <div className={grid}>
          <Field label="Unit"><TextField value={doc.data.unitNo} onChange={(v) => set((d) => { d.unitNo = v })} /></Field>
          <Field label="Statement date"><DateField value={doc.data.statementDate} onChange={(v) => set((d) => { d.statementDate = v })} /></Field>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-[#7c6f54]">Ledger rows: charge period, O/S amount (receipts negative)</p>
        {doc.data.rows.map((r, k) => (
          <div key={k} className="grid grid-cols-4 gap-1.5 items-end border-t border-[#332c20] pt-2">
            <Field label="From"><DateField value={r.periodStart} onChange={(v) => set((d) => { d.rows[k].periodStart = v })} /></Field>
            <Field label="To"><DateField value={r.periodEnd} onChange={(v) => set((d) => { d.rows[k].periodEnd = v })} /></Field>
            <Field label="O/S (RM)"><NumField value={r.outstanding} onChange={(v) => set((d) => { d.rows[k].outstanding = v ?? 0 })} /></Field>
            <div className="pb-1.5">
              <RowButton label="Remove row" onClick={() => set((d) => { d.rows.splice(k, 1) })}><X size={13} /></RowButton>
            </div>
          </div>
        ))}
        <RowButton label="Add row" onClick={() => set((d) => {
          d.rows.push({ date: null, tranNo: null, periodStart: null, periodEnd: null, outstanding: 0 })
        })}>
          <Plus size={12} /> Add row
        </RowButton>
      </div>
    )
  }

  return null
}

// ── Result ───────────────────────────────────────────────────────────────────

function ResultBlock({ icon, title, outcome }: { icon: React.ReactNode; title: string; outcome: UtilityOutcome }) {
  if (!outcome) return null
  const needsInput = 'error' in outcome
  return (
    <div className="rounded-xl border border-[#332c20] bg-[#181410] px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#a89d84] uppercase tracking-wider">
          <span className="text-gold-400">{icon}</span>{title}
        </span>
        {!needsInput && <span className="text-base font-semibold text-[#f5f0e8]">{rm(outcome.amount)}</span>}
      </div>
      {needsInput ? (
        <p className="flex gap-2 text-xs text-orange-300">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>Needs input: {outcome.error}</span>
        </p>
      ) : (
        <>
          <p className="text-xs text-[#f5f0e8]">{outcome.note}</p>
          <ol className="space-y-0.5 border-t border-[#332c20] pt-2">
            {outcome.steps.map((s, k) => (
              <li key={k} className="text-[11px] leading-relaxed text-[#a89d84] font-mono break-words">{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
