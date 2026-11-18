'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, Check, FileText, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react'
import {
  createService, createServiceProvider, extractError, getRecord, updateService, uploadInvoice,
} from '@/lib/api'
import {
  contractorServicePayload, defaultPaymentBy, findDescription, findDuplicate, keywordDescription, matchProvider,
  parseContractorText, providerBankText, type ContractorDoc,
} from '@/lib/contractorParsers'
import { compressImage } from '@/lib/imageCompress'
import { ocrText } from '@/lib/ocr'
import { extractPdfLines, renderPdfPages } from '@/lib/pdfText'
import { PAYMENT_BY_CHECKOUT, PAYMENT_BY_OTHER } from '@/lib/types'
import type { PaymentBy, PropertyRecord, Service, ServiceDescription, ServiceProvider } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { normaliseUnit, unitsMatch } from '@/lib/utilityDocs'
import Button from '@/components/ui/Button'

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MIN_TEXT_CHARS = 40
const ADD_PROVIDER = '__add__'

type Row = {
  id: string
  file: File
  isImage: boolean
  status: 'reading' | 'ocr' | 'done'
  progress: number
  doc: ContractorDoc | null
  warnings: string[]
  providerId: string
  description: string
  amount: string
  paymentBy: PaymentBy
  useAnyway: boolean
  dupMode: 'update' | 'add'
  newProvider: { name: string; bank: string; account: string } | null
  error: string
}

const fieldCls =
  'w-full rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1.5 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60'
const optionCls = 'bg-[#1e1a14] text-[#f5f0e8]'

/** Size of an already-attached file (HEAD request to its public URL), or null if unknown. */
async function attachedSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    const len = res.ok ? res.headers.get('content-length') : null
    return len ? Number(len) : null
  } catch {
    return null
  }
}

export default function ContractorUpload({
  record, services, providers, descriptions, onAdded,
}: {
  record: PropertyRecord
  services: Service[]
  providers: ServiceProvider[]
  descriptions: ServiceDescription[]
  onAdded: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [extraProviders, setExtraProviders] = useState<ServiceProvider[]>([])
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const allProviders = [...providers, ...extraProviders.filter((p) => !providers.some((q) => q.id === p.id))]
  const paymentOptions = record.type === 'checkout' ? PAYMENT_BY_CHECKOUT : PAYMENT_BY_OTHER
  const recordUnit = record.unit?.unit_number ?? ''

  const patch = (id: string, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)))

  async function readText(row: Row): Promise<string> {
    const { file } = row
    if (row.isImage) {
      patch(row.id, { status: 'ocr', progress: 0 })
      // EXIF-rotated, max ~2200px, light JPEG compression: good OCR input without huge memory use.
      const { blob } = await compressImage(file, { maxEdge: 2200, quality: 0.92 })
      return ocrText([blob], (p) => patch(row.id, { progress: p }))
    }
    const lines = await extractPdfLines(await file.arrayBuffer())
    const text = lines.join('\n')
    if (text.replace(/\s/g, '').length >= MIN_TEXT_CHARS) return text
    // Little or no text layer (e.g. Cuci Clan PDFs): render pages at 2x and OCR them.
    patch(row.id, { status: 'ocr', progress: 0 })
    const pages = await renderPdfPages(await file.arrayBuffer(), 2, 3)
    return ocrText(pages, (p) => patch(row.id, { progress: p }))
  }

  async function readRow(row: Row) {
    let text = ''
    const warnings: string[] = []
    try {
      text = await readText(row)
    } catch (e) {
      warnings.push(`Could not read this file (${extractError(e)}): fill in the fields by hand`)
    }
    const doc = parseContractorText(text)
    warnings.push(...doc.warnings)

    const provider = matchProvider(doc.vendor, text, allProviders)
    let description = ''
    if (doc.targetDescription) {
      const found = findDescription(doc.targetDescription, descriptions)
      if (found) description = found.description
      else warnings.push(`Service description '${doc.targetDescription}' not found in the list: pick one`)
    } else if (text) {
      description = keywordDescription(text, descriptions)?.description ?? ''
    }
    if (doc.vendor && !provider) warnings.push(`${doc.vendorName} is not in the app's providers: pick or add one`)

    patch(row.id, {
      status: 'done',
      doc,
      warnings,
      providerId: provider?.id ?? '',
      description,
      amount: doc.total != null ? doc.total.toFixed(2) : '',
    })
  }

  async function addFiles(list: FileList) {
    setMessage('')
    const fresh: Row[] = Array.from(list).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      isImage: file.type.startsWith('image/'),
      status: 'reading',
      progress: 0,
      doc: null,
      warnings: [],
      providerId: '',
      description: '',
      amount: '',
      paymentBy: defaultPaymentBy(record.type),
      useAnyway: false,
      dupMode: 'update',
      newProvider: null,
      error: '',
    }))
    const bad = (f: File) => !(f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    setRows((prev) => [...prev, ...fresh.map((r) =>
      bad(r.file) ? { ...r, status: 'done' as const, warnings: ['Only PDF and image files can be read: fill in the fields by hand'] }
        : r.file.size > MAX_FILE_BYTES ? { ...r, status: 'done' as const, warnings: ['Larger than 15 MB: not read, fill in the fields by hand'] }
        : r)])
    // One file at a time: OCR is heavy on phones.
    for (const r of fresh) if (!bad(r.file) && r.file.size <= MAX_FILE_BYTES) await readRow(r)
  }

  function rowState(r: Row) {
    const amount = r.amount.trim() === '' || Number.isNaN(Number(r.amount)) ? null : Number(r.amount)
    const docUnit = r.doc?.unitNo ?? null
    const mismatch = !!docUnit && !!recordUnit && !unitsMatch(docUnit, recordUnit)
    const dup = findDuplicate(services, r.providerId || null, r.description, amount)
    const provider = allProviders.find((p) => p.id === r.providerId) ?? null
    const missing: string[] = []
    if (!r.description) missing.push('description')
    if (amount == null || amount <= 0) missing.push('amount')
    return { amount, docUnit, mismatch, dup, provider, missing, blocked: r.status !== 'done' || (mismatch && !r.useAnyway) }
  }

  async function saveNewProvider(r: Row) {
    const np = r.newProvider
    if (!np || !np.name.trim()) return
    try {
      const created = await createServiceProvider({ name: np.name.trim(), bank_name: np.bank.trim(), bank_account: np.account.trim() })
      setExtraProviders((prev) => [...prev, created])
      patch(r.id, { providerId: created.id, newProvider: null, error: '' })
    } catch (e) {
      patch(r.id, { error: extractError(e) })
    }
  }

  async function addAll() {
    setAdding(true)
    setMessage('')
    const done: string[] = []
    try {
      // Fresh services so duplicate checks see anything added a moment ago.
      const current = (await getRecord(record.id))?.services ?? services
      for (const r of rows) {
        const st = rowState(r)
        if (st.blocked) continue
        if (st.missing.length) { patch(r.id, { error: `Fill in: ${st.missing.join(', ')}` }); continue }
        try {
          const dup = findDuplicate(current, r.providerId || null, r.description, st.amount)
          if (dup && r.dupMode === 'update') {
            const existing = current.find((s) => s.id === dup.id)!
            const urls = [existing.invoice_url, existing.invoice_url_2, existing.invoice_url_3]
            const sizes = await Promise.all(urls.map((u) => (u ? attachedSize(u) : Promise.resolve(null))))
            if (sizes.some((s) => s === r.file.size)) {
              done.push(`${r.description}: already added, file already attached`)
            } else {
              const slot = urls.findIndex((u) => !u)
              if (slot < 0) {
                done.push(`${r.description}: already added; all 3 invoice slots are full, file not attached`)
              } else {
                const url = await uploadInvoice(r.file, existing.id, (slot + 1) as 1 | 2 | 3)
                const key = (['invoice_url', 'invoice_url_2', 'invoice_url_3'] as const)[slot]
                await updateService(existing.id, { [key]: url })
                done.push(`${r.description}: already added, file attached`)
              }
            }
          } else {
            const created = await createService(contractorServicePayload({
              recordId: record.id,
              recordType: record.type,
              description: r.description,
              providerId: r.providerId || null,
              amount: st.amount!,
              paymentBy: r.paymentBy,
            }))
            const url = await uploadInvoice(r.file, created.id, 1)
            await updateService(created.id, { invoice_url: url })
            current.push({ ...created, invoice_url: url })
            done.push(`${r.description} RM ${st.amount!.toFixed(2)} added`)
          }
          setRows((prev) => prev.filter((x) => x.id !== r.id))
        } catch (e) {
          patch(r.id, { error: extractError(e) })
        }
      }
      if (done.length) onAdded()
      setMessage(done.join(' · '))
    } finally {
      setAdding(false)
    }
  }

  const ready = rows.filter((r) => !rowState(r).blocked)
  const readyCount = ready.length
  const allUpdates = readyCount > 0 && ready.every((r) => rowState(r).dup && r.dupMode === 'update')
  const busy = rows.some((r) => r.status !== 'done')

  return (
    <div className="space-y-3 mb-3">
      <Button variant="outline" size="sm" fullWidth icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>
        Upload invoice / quotation
      </Button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
      />

      {message && (
        <p className="flex gap-2 text-xs text-emerald-300"><Check size={13} className="shrink-0 mt-0.5" /><span>{message}</span></p>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] divide-y divide-[#332c20] overflow-hidden">
          {rows.map((r) => {
            const st = rowState(r)
            const Icon = r.isImage ? ImageIcon : FileText
            const d = r.doc
            return (
              <div key={r.id} className="p-3 space-y-2.5">
                {/* File + what was read */}
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5">
                    {r.status !== 'done'
                      ? <Loader2 size={15} className="text-gold-400 animate-spin" />
                      : <Icon size={15} className={r.warnings.length || st.mismatch ? 'text-orange-300' : 'text-[#a89d84]'} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f5f0e8] truncate">{d?.vendorName ?? r.file.name}</p>
                    <p className="text-[11px] text-[#7c6f54] truncate">
                      {r.status === 'reading' && 'Reading…'}
                      {r.status === 'ocr' && `Reading image… ${Math.round(r.progress * 100)}%`}
                      {r.status === 'done' && [
                        d?.docNo ? `No. ${d.docNo}` : null,
                        d?.date ? formatDate(d.date) : null,
                        st.docUnit ? `Unit ${normaliseUnit(st.docUnit) ?? st.docUnit}` : null,
                        r.file.name,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                    aria-label={`Remove ${r.file.name}`} className="shrink-0 p-1 text-[#7c6f54] hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>

                {r.status === 'done' && (
                  <>
                    {/* Warnings */}
                    {(r.warnings.length > 0 || st.mismatch) && (
                      <div className="space-y-0.5">
                        {st.mismatch && (
                          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-orange-300">
                            <span>Unit {st.docUnit} does not match {recordUnit}{r.useAnyway ? ': used anyway' : ': not added'}</span>
                            <button type="button" onClick={() => patch(r.id, { useAnyway: !r.useAnyway })}
                              className="font-semibold text-gold-400 hover:text-gold-300 underline underline-offset-2">
                              {r.useAnyway ? 'Undo' : 'Use anyway'}
                            </button>
                          </p>
                        )}
                        {r.warnings.map((w, k) => (
                          <p key={k} className="flex gap-1.5 text-[11px] text-orange-300">
                            <AlertTriangle size={11} className="shrink-0 mt-0.5" /><span>{w}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Editable fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-[#7c6f54]">Provider</span>
                        <select
                          className={fieldCls}
                          value={r.newProvider ? ADD_PROVIDER : r.providerId}
                          onChange={(e) => e.target.value === ADD_PROVIDER
                            ? patch(r.id, { newProvider: { name: '', bank: '', account: '' } })
                            : patch(r.id, { providerId: e.target.value, newProvider: null })}
                        >
                          <option value="" className={optionCls}>Select provider…</option>
                          {allProviders.map((p) => <option key={p.id} value={p.id} className={optionCls}>{p.name}</option>)}
                          <option value={ADD_PROVIDER} className={optionCls}>+ Add provider…</option>
                        </select>
                        <span className={`text-[11px] ${st.provider ? 'text-[#a89d84]' : 'text-orange-300'}`}>
                          {st.provider ? providerBankText(st.provider) : 'Provider not in app'}
                        </span>
                      </label>

                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-[#7c6f54]">Service description</span>
                        <select className={fieldCls} value={r.description} onChange={(e) => patch(r.id, { description: e.target.value })}>
                          <option value="" className={optionCls}>Select description…</option>
                          {descriptions.map((dsc) => <option key={dsc.id} value={dsc.description} className={optionCls}>{dsc.description}</option>)}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-[#7c6f54]">Amount (RM)</span>
                        <input className={fieldCls} inputMode="decimal" value={r.amount} placeholder="0.00"
                          onChange={(e) => patch(r.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })} />
                      </label>

                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-[#7c6f54]">Payment by</span>
                        <select className={fieldCls} value={r.paymentBy} onChange={(e) => patch(r.id, { paymentBy: e.target.value as PaymentBy })}>
                          {paymentOptions.map((p) => <option key={p} value={p} className={optionCls}>{p}</option>)}
                        </select>
                      </label>
                    </div>

                    {/* New provider (empty form; bank details typed by you, never read from the document) */}
                    {r.newProvider && (
                      <div className="rounded-lg border border-[#332c20] bg-[#181410] p-2.5 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-[#7c6f54]">New provider</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(['name', 'bank', 'account'] as const).map((k) => (
                            <input key={k} className={fieldCls}
                              placeholder={k === 'name' ? 'Provider name' : k === 'bank' ? 'Bank name' : 'Account number'}
                              value={r.newProvider![k]}
                              onChange={(e) => patch(r.id, { newProvider: { ...r.newProvider!, [k]: e.target.value } })} />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" className="!py-1.5" disabled={!r.newProvider.name.trim()} onClick={() => saveNewProvider(r)}>
                            Save provider
                          </Button>
                          <Button size="sm" variant="ghost" className="!py-1.5" onClick={() => patch(r.id, { newProvider: null })}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {/* Duplicate */}
                    {st.dup && (
                      <div className="rounded-lg border border-orange-500/30 bg-orange-500/20 px-2.5 py-2 space-y-1.5">
                        <p className="text-[11px] font-medium text-orange-300">Looks like this is already added</p>
                        <div className="flex flex-wrap gap-3">
                          {(['update', 'add'] as const).map((m) => (
                            <label key={m} className="flex items-center gap-1.5 text-[11px] text-[#f5f0e8] cursor-pointer">
                              <input type="radio" name={`dup-${r.id}`} checked={r.dupMode === m}
                                onChange={() => patch(r.id, { dupMode: m })} className="accent-gold-500" />
                              {m === 'update' ? 'Update existing (attach file if missing)' : 'Add anyway'}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.error && <p className="text-[11px] text-red-400">{r.error}</p>}
                  </>
                )}
              </div>
            )
          })}

          <div className="p-3">
            <Button variant="primary" fullWidth loading={adding} disabled={busy || readyCount === 0} onClick={addAll}>
              {allUpdates ? 'Update existing' : 'Add to services'}{readyCount > 1 ? ` (${readyCount})` : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
