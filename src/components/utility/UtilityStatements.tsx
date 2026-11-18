'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, FileText, Loader2, Upload, X, Zap, Droplets } from 'lucide-react'
import {
  authJsonHeaders, createService, createServiceProvider, extractError, getRecord, updateRecord, updateService, uploadInvoice,
} from '@/lib/api'
import { compressImage } from '@/lib/imageCompress'
import { computeMeterRequest, meterBaseDate } from '@/lib/meterEmail'
import type { PaymentBy, PropertyRecord, ServiceProvider, Unit } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  DOC_TYPE_LABELS, ELEC_PROVIDER, ELEC_SERVICE, MAX_UTILITY_FILES, MAX_UTILITY_FILE_BYTES, UTILITY_BUILDINGS,
  WATER_SERVICE, buildPlan, docPeriod, docUnit, waterProviderFor,
  type UtilityDoc, type UtilityOutcome, type UtilityReadResult,
} from '@/lib/utilityDocs'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'

type Item = {
  id: string
  name: string
  /** What gets uploaded on Apply: the original PDF, or the compressed JPEG for images. */
  file: File
  previewUrl: string | null
  status: 'reading' | 'done' | 'error'
  doc?: UtilityDoc
  warning?: string
  error?: string
}

const CONCURRENCY = 3

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function rm(n: number) {
  return `RM ${n.toFixed(2)}`
}

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
  const [photoReading, setPhotoReading] = useState('')
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

  async function readItem(item: Item) {
    try {
      const res = await fetch('/api/read-utility', {
        method: 'POST',
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          unitNo: unit.unit_number,
          files: [{ name: item.name, mimeType: item.file.type, base64: await blobToBase64(item.file) }],
        }),
      })
      if (res.status === 413) throw new Error('file too large to send (try a smaller PDF or a photo)')
      if (res.status === 401) throw new Error('not signed in, please sign in again')
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `server error ${res.status}`)
      const result = ((await res.json()).results?.[0] ?? { error: 'no result' }) as UtilityReadResult
      if ('error' in result) patch(item.id, { status: 'error', error: result.error })
      else {
        const { warning, ...doc } = result
        patch(item.id, { status: 'done', doc: doc as UtilityDoc, warning })
      }
    } catch (e) {
      patch(item.id, { status: 'error', error: extractError(e) })
    }
  }

  async function addFiles(list: FileList | File[]) {
    setApplyMsg('')
    setApplyErr('')
    const room = MAX_UTILITY_FILES - itemsRef.current.length
    const incoming = Array.from(list).slice(0, Math.max(0, room))
    if (!incoming.length) return

    const prepared: Item[] = []
    for (const f of incoming) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      const isImage = f.type.startsWith('image/')
      const base: Item = { id, name: f.name, file: f, previewUrl: null, status: 'reading' }
      if (!isPdf && !isImage) {
        prepared.push({ ...base, status: 'error', error: 'only PDF and image files' })
      } else if (f.size > MAX_UTILITY_FILE_BYTES) {
        prepared.push({ ...base, status: 'error', error: 'larger than 10 MB' })
      } else if (isImage) {
        try {
          const { blob } = await compressImage(f)
          const file = new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
          prepared.push({ ...base, file, previewUrl: URL.createObjectURL(file) })
        } catch {
          prepared.push({ ...base, status: 'error', error: 'could not open this image' })
        }
      } else {
        prepared.push({ ...base, file: new File([f], f.name, { type: 'application/pdf' }) })
      }
    }
    setItems((prev) => [...prev, ...prepared])

    // One request per file (keeps each request small), CONCURRENCY at a time.
    const queue = prepared.filter((p) => p.status === 'reading')
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await readItem(next)
      }),
    )
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((i) => i.id !== id)
    })
  }

  const docs = useMemo(
    () => items.filter((i) => i.status === 'done' && i.doc).map((i) => ({ id: i.id, name: i.name, doc: i.doc! })),
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
        photoReading: numOrNull(photoReading),
      }),
    [recordType, unit.unit_number, unit.dual_key, eventDate, tenancyStart, docs, elecReading, elecDate, plannedDate, photoReading],
  )

  // Prefill the editable photo reading whenever a different photo becomes the one in use.
  const photoItem = items.find((i) => i.id === plan.photoDocId)
  const photoDoc = photoItem?.doc?.type === 'water_meter_photo' ? photoItem.doc : null
  const lastPhotoId = useRef<string | null>(null)
  useEffect(() => {
    if (plan.photoDocId === lastPhotoId.current) return
    lastPhotoId.current = plan.photoDocId
    setPhotoReading(photoDoc?.data.reading != null ? String(photoDoc.data.reading) : '')
  }, [plan.photoDocId, photoDoc])

  const reading = items.some((i) => i.status === 'reading')
  const hasWater = !!plan.water && !('error' in plan.water)
  const hasElec = !!plan.elec && !('error' in plan.elec)
  const needsElecReading = items.some((i) => i.doc?.type === 'ynh_invoice')

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
        <p className="text-[11px] text-[#7c6f54]">or tap to choose · PDF or image · up to {MAX_UTILITY_FILES} files, 10 MB each</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {items.length > 0 && (
        <>
          {/* Recognised files */}
          <div className="rounded-xl border border-[#332c20] divide-y divide-[#332c20] overflow-hidden">
            {items.map((i) => {
              const excluded = plan.excluded.includes(i.id)
              const u = i.doc ? docUnit(i.doc) : null
              return (
                <div key={i.id} className="flex items-start gap-3 px-3 py-2.5 bg-[#1e1a14]">
                  <div className="shrink-0 mt-0.5">
                    {i.status === 'reading' ? <Loader2 size={15} className="text-gold-400 animate-spin" />
                      : i.status === 'error' ? <AlertTriangle size={15} className="text-red-400" />
                      : <FileText size={15} className={excluded ? 'text-orange-300' : 'text-[#a89d84]'} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f5f0e8] truncate">
                      {i.status === 'done' && i.doc ? DOC_TYPE_LABELS[i.doc.type] : i.name}
                    </p>
                    <p className="text-[11px] text-[#7c6f54] truncate">
                      {i.status === 'reading' && 'Reading…'}
                      {i.status === 'error' && <span className="text-red-400">{i.error}</span>}
                      {i.status === 'done' && i.doc && [u ? `Unit ${u}` : null, docPeriod(i.doc), i.name].filter(Boolean).join(' · ')}
                    </p>
                    {(i.warning || excluded) && (
                      <p className="text-[11px] text-orange-300">{i.warning ?? 'Unit does not match: not used'}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(i.id)}
                    aria-label={`Remove ${i.name}`}
                    className="shrink-0 p-1 text-[#7c6f54] hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            {needsElecReading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-end">
                <Input
                  label={`Electricity meter reading as of ${formatDate(elecDate || plannedDate)} (kWh)`}
                  type="number"
                  inputMode="decimal"
                  value={elecReading}
                  onChange={(e) => setElecReading(e.target.value)}
                  placeholder="From the YNH email"
                />
                <Input
                  label="Reading date"
                  type="date"
                  value={elecDate}
                  onChange={(e) => setElecDate(e.target.value)}
                />
              </div>
            )}

            {!isCheckIn && photoItem && (
              <div className="flex items-end gap-3">
                {photoItem.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoItem.previewUrl}
                    alt="Water meter"
                    className={`h-20 w-20 shrink-0 rounded-lg object-cover border ${
                      photoDoc?.data.confidence === 'low' ? 'border-red-500 ring-1 ring-red-500' : 'border-[#332c20]'
                    }`}
                  />
                )}
                <div className="flex-1">
                  <Input
                    label={`Water meter reading (m³)${photoDoc?.data.confidence === 'low' ? ' · low confidence, please check' : ''}`}
                    type="number"
                    inputMode="numeric"
                    value={photoReading}
                    onChange={(e) => setPhotoReading(e.target.value)}
                    className={photoDoc?.data.confidence === 'low' ? '!border-red-500 ring-1 ring-red-500' : ''}
                  />
                </div>
              </div>
            )}

            {!isCheckIn && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Tenancy start"
                  type="date"
                  value={tenancyStart}
                  onChange={(e) => setTenancyStart(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#a89d84]">Move-out date</span>
                  <span className="px-3 py-2.5 text-sm text-[#f5f0e8]">{formatDate(eventDate)}</span>
                </div>
              </div>
            )}
            {isCheckIn && (
              <p className="text-xs text-[#7c6f54]">Move-in date: <span className="text-[#a89d84]">{formatDate(eventDate)}</span></p>
            )}
          </div>

          {/* Results */}
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

          <Button
            variant="primary"
            fullWidth
            loading={applying}
            disabled={reading || (!hasWater && !hasElec)}
            onClick={apply}
          >
            Apply to record
          </Button>
        </>
      )}
    </Card>
  )
}

function ResultBlock({ icon, title, outcome }: { icon: React.ReactNode; title: string; outcome: UtilityOutcome }) {
  if (!outcome) return null
  const isError = 'error' in outcome
  return (
    <div className="rounded-xl border border-[#332c20] bg-[#181410] px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#a89d84] uppercase tracking-wider">
          <span className="text-gold-400">{icon}</span>{title}
        </span>
        {!isError && <span className="text-base font-semibold text-[#f5f0e8]">{rm(outcome.amount)}</span>}
      </div>
      {isError ? (
        <p className="text-xs text-red-400">{outcome.error}</p>
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
