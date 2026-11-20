'use client'

// "Upload documents" for a tenancy agreement draft. Files are read in this browser only (pdf.js text, or
// tesseract OCR for pictures/scans) and then discarded: nothing is uploaded or stored. Values found go
// straight into the normal boxes (tagged "Read from <file>"); anything uncertain is shown as an orange warning.

import { useRef, useState } from 'react'
import { FileUp, Loader2, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { TenancyData } from '@/lib/tenancy/types'
import {
  classifyTenancyText, parseAgreementToRent, parseBankAddress, parseLandlordNames, parsePassport, type DocKind,
} from '@/lib/tenancy/docParsers'
import {
  addExtraClause, applyAddress, applyAtr, applyBankAddress, applyLandlords, applyPassport,
  type AddressTarget, type ApplyResult, type Finding, type Pending,
} from '@/lib/tenancy/docApply'

const KIND_LABEL: Record<DocKind, string> = {
  atr: 'Agreement to Rent',
  landlords: 'Landlord names',
  passport: 'Passport',
  bankAddress: 'Bank details / address',
  unknown: 'Not recognised',
}

interface Entry {
  id: string
  name: string
  status: 'reading' | 'done' | 'error'
  step: string
  progress: number | null
  ocr: boolean
  text: string
  kind: DocKind
  findings: Finding[]
  warnings: string[]
  pending: (Pending & { done?: string })[]
  error?: string
}

interface Props {
  data: TenancyData
  getData: () => TenancyData
  onApply: (next: TenancyData, sources: Record<string, string>) => void
}

let seq = 0

export default function DocDropZone({ data, getData, onApply }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const patch = (id: string, p: Partial<Entry>) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)))

  /** Parse text as `kind` and put the values into the form. */
  function runParse(id: string, name: string, text: string, kind: DocKind) {
    let r: ApplyResult | null = null
    const d = getData()
    if (kind === 'atr') r = applyAtr(d, parseAgreementToRent(text), name)
    else if (kind === 'passport') r = applyPassport(d, parsePassport(text), name)
    else if (kind === 'bankAddress') r = applyBankAddress(d, parseBankAddress(text), name)
    else if (kind === 'landlords') {
      const p = parseLandlordNames(text)
      r = applyLandlords(d, p.landlords, name, 'picture')
      r.warnings.unshift(...p.warnings)
    }
    if (!r) {
      patch(id, { status: 'done', kind, findings: [], pending: [], warnings: ['Could not tell what this is. Pick the type under "Read as", or type the boxes yourself.'] })
      return
    }
    onApply(r.data, r.sources)
    const warnings = [...r.warnings]
    if (!r.findings.length && !r.pending.length) warnings.unshift('Nothing usable was found in this file.')
    patch(id, { status: 'done', kind, findings: r.findings, warnings, pending: r.pending })
  }

  async function readFile(file: File, id: string): Promise<{ text: string; ocr: boolean }> {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const { ocrText } = await import('@/lib/ocr')
    if (isPdf) {
      const { extractPdfLines, renderPdfPages } = await import('@/lib/pdfText')
      patch(id, { step: 'Reading PDF text…' })
      const lines = await extractPdfLines(await file.arrayBuffer())
      const text = lines.join('\n')
      if (text.replace(/\s/g, '').length >= 40) return { text, ocr: false }
      patch(id, { step: 'Scanned PDF: reading pages with OCR…', progress: 0 })
      const { enhanceCanvas } = await import('@/lib/tenancy/ocrPrep')
      const pages = (await renderPdfPages(await file.arrayBuffer(), 2, 3)).map(enhanceCanvas)
      return { text: await ocrText(pages, (p) => patch(id, { progress: p })), ocr: true }
    }
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      throw new Error('This browser cannot open HEIC photos. Send it as JPG (or take a screenshot) and try again.')
    }
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) {
      throw new Error('Only PDF files and pictures (JPG/PNG) can be read.')
    }
    patch(id, { step: 'Preparing picture…' })
    const { prepareImageForOcr } = await import('@/lib/tenancy/ocrPrep')
    const canvas = await prepareImageForOcr(file)
    patch(id, { step: 'Reading picture with OCR (first time downloads the free OCR engine)…', progress: 0 })
    return { text: await ocrText([canvas], (p) => patch(id, { progress: p })), ocr: true }
  }

  function addEntry(name: string): string {
    const id = `doc-${++seq}`
    setEntries((es) => [...es, { id, name, status: 'reading', step: 'Waiting…', progress: null, ocr: false, text: '', kind: 'unknown', findings: [], warnings: [], pending: [] }])
    return id
  }

  function enqueue(job: () => Promise<void>) {
    // One file at a time: OCR is heavy on phones.
    queue.current = queue.current.then(job, job)
  }

  function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = addEntry(file.name)
      enqueue(async () => {
        try {
          const { text, ocr } = await readFile(file, id)
          patch(id, { text, ocr, step: '', progress: null })
          runParse(id, file.name, text, classifyTenancyText(text))
        } catch (e) {
          patch(id, { status: 'error', error: (e as Error)?.message ?? String(e), step: '', progress: null })
        }
      })
    }
  }

  function handlePaste() {
    const text = pasted.trim()
    if (!text) return
    const id = addEntry('Pasted text')
    patch(id, { text })
    runParse(id, 'Pasted text', text, classifyTenancyText(text))
    setPasted('')
  }

  function resolve(id: string, idx: number, message: string, r?: { data: TenancyData; sources: Record<string, string> }) {
    if (r) onApply(r.data, r.sources)
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, pending: e.pending.map((p, j) => (j === idx ? { ...p, done: message } : p)) } : e)))
  }

  function handlePending(e: Entry, idx: number, action: { tenantIndex?: number; force?: boolean; target?: AddressTarget }) {
    const p = e.pending[idx]
    const d = getData()
    if (p.kind === 'landlords') {
      resolve(e.id, idx, `Landlords replaced with the ${p.sourceLabel} names.`, applyLandlords(d, p.incoming, e.name, p.sourceLabel, true))
    } else if (p.kind === 'clause') {
      const next = addExtraClause(d, p.margin, p.text)
      resolve(e.id, idx, 'Added under Additional clauses (you can edit or move it there).', { data: next, sources: {} })
    } else if (p.kind === 'passportTenant') {
      const r = applyPassport(d, p.passport, e.name, { tenantIndex: action.tenantIndex, force: action.force })
      if (r.pending.length) {
        // Still a mismatch for the chosen tenant: show it instead.
        setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, pending: x.pending.map((q, j) => (j === idx ? r.pending[0] : q)), warnings: [...x.warnings, ...r.warnings.filter((w) => /mismatch/.test(w))] } : x)))
        return
      }
      resolve(e.id, idx, `Passport details put on Tenant ${(action.tenantIndex ?? 0) + 1}.`, r)
      setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, findings: [...x.findings, ...r.findings] } : x)))
    } else if (p.kind === 'address' && action.target) {
      const r = applyAddress(d, p.address, action.target, e.name)
      onApply(r.data, r.sources)
      setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, pending: x.pending.map((q, j) => (j === idx ? { ...p, target: action.target! } : q)) } : x)))
    }
  }

  const reading = entries.some((e) => e.status === 'reading')

  return (
    <div className="space-y-3">
      <div
        onDragOver={(ev) => { ev.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(ev) => { ev.preventDefault(); setDragging(false); if (ev.dataTransfer.files.length) handleFiles(ev.dataTransfer.files) }}
        className={cn(
          'rounded-xl border border-dashed px-3 py-4 text-center space-y-2 transition-colors',
          dragging ? 'border-gold-500/60 bg-gold-500/10' : 'border-[#4a4030] bg-[#141210]',
        )}
      >
        <p className="text-xs text-[#a89d84]">
          Drop the Agreement to Rent, passport photos, landlord name screenshots or bank details here (PDF, JPG, PNG; several at once).
        </p>
        <Button variant="secondary" size="sm" icon={<FileUp size={14} />} onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(ev) => { if (ev.target.files?.length) handleFiles(ev.target.files); ev.target.value = '' }}
        />
        <p className="text-[11px] text-[#7c6f54]">Read on this device only. Files are not uploaded or kept; only the values in the boxes are saved.</p>
      </div>

      <div className="space-y-2">
        <textarea
          rows={3}
          value={pasted}
          onChange={(ev) => setPasted(ev.target.value)}
          placeholder={'Or paste text (e.g. WhatsApp bank details or an address):\nHONG LEONG BANK\n193-00009355\nLIM LEE YEOW'}
          className="w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60 resize-y"
        />
        <Button variant="secondary" size="sm" disabled={!pasted.trim()} onClick={handlePaste}>Read pasted text</Button>
      </div>

      {entries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#a89d84]">Review</span>
            {!reading && <button type="button" onClick={() => setEntries([])} className="text-xs text-[#7c6f54] hover:text-[#f5f0e8]">Clear list</button>}
          </div>
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} data={data} onReparse={(k) => runParse(e.id, e.name, e.text, k)} onPending={(i, a) => handlePending(e, i, a)} onRemove={() => setEntries((es) => es.filter((x) => x.id !== e.id))} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryCard({
  entry: e, data, onReparse, onPending, onRemove,
}: {
  entry: Entry
  data: TenancyData
  onReparse: (k: DocKind) => void
  onPending: (idx: number, action: { tenantIndex?: number; force?: boolean; target?: AddressTarget }) => void
  onRemove: () => void
}) {
  const [tenantChoice, setTenantChoice] = useState(0)
  return (
    <div className="rounded-xl border border-[#332c20] bg-[#141210] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-[#f5f0e8] font-medium truncate">{e.name}</p>
          <p className="text-xs text-[#7c6f54]">
            {e.status === 'reading' ? e.step || 'Reading…' : e.status === 'error' ? 'Could not read' : `${KIND_LABEL[e.kind]}${e.ocr ? ' · read with OCR' : ''}`}
          </p>
        </div>
        {e.status !== 'reading' && (
          <button type="button" aria-label="Remove from list" onClick={onRemove} className="p-1 rounded-lg text-[#7c6f54] hover:text-[#f5f0e8] hover:bg-[#262018]"><X size={14} /></button>
        )}
      </div>

      {e.status === 'reading' && (
        <div className="flex items-center gap-2 text-xs text-[#7c6f54]">
          <Loader2 size={13} className="animate-spin" />
          {e.progress != null && <span>{Math.round(e.progress * 100)}%</span>}
        </div>
      )}
      {e.status === 'error' && <p className="text-xs text-orange-300">{e.error} You can still type the boxes yourself.</p>}

      {e.status === 'done' && (
        <>
          <label className="flex items-center gap-2 text-xs text-[#7c6f54]">
            Read as
            <select
              value={e.kind}
              onChange={(ev) => onReparse(ev.target.value as DocKind)}
              className="rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1 text-xs text-[#f5f0e8]"
            >
              {(Object.keys(KIND_LABEL) as DocKind[]).filter((k) => k !== 'unknown' || e.kind === 'unknown').map((k) => (
                <option key={k} value={k} className="bg-[#1e1a14] text-[#f5f0e8]">{KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>

          {e.findings.length > 0 && (
            <ul className="space-y-1">
              {e.findings.map((f, i) => (
                <li key={i} className="text-xs text-[#a89d84]">
                  <span className="text-[#7c6f54]">{f.label}: </span>
                  <span className={cn('text-[#f5f0e8]', f.big && 'font-mono text-base font-semibold tracking-wide')}>{f.value}</span>
                  <span className="text-[#7c6f54]"> → {f.target}</span>
                </li>
              ))}
            </ul>
          )}

          {e.warnings.map((w, i) => (
            <p key={i} className="text-xs text-orange-300">⚠ {w}</p>
          ))}
          {e.ocr && e.findings.some((f) => f.big) && (
            <p className="text-xs text-orange-300">⚠ Read with OCR: check every ID and account number digit against the picture.</p>
          )}

          {e.pending.map((p, i) => (
            <div key={i} className="rounded-lg border border-orange-500/30 bg-orange-500/20 p-2 space-y-2 text-xs text-orange-300">
              {p.done ? (
                <p className="text-[#a89d84]">✓ {p.done}</p>
              ) : p.kind === 'landlords' ? (
                <>
                  {p.diffs.map((d, j) => <p key={j}>{d}</p>)}
                  <label className="flex items-center gap-2 text-[#f5f0e8]">
                    <input type="checkbox" onChange={(ev) => { if (ev.target.checked) onPending(i, {}) }} />
                    Use {p.sourceLabel} (replace the landlord names and IDs)
                  </label>
                </>
              ) : p.kind === 'clause' ? (
                <>
                  <p className="text-[#f5f0e8]">Suggested extra clause ({p.margin}):</p>
                  <p className="text-[#a89d84]">{p.text}</p>
                  <Button variant="secondary" size="sm" onClick={() => onPending(i, {})}>Add as extra clause</Button>
                </>
              ) : p.kind === 'passportTenant' ? (
                p.reason === 'mismatch' ? (
                  <>
                    <p>Passport number mismatch for Tenant {(p.tenantIndex ?? 0) + 1}:</p>
                    <p>In the form: <span className="font-mono text-base font-semibold">{p.existingNo}</span></p>
                    <p>On this passport: <span className="font-mono text-base font-semibold">{p.passport.passportNo || '(unread)'}</span></p>
                    <Button variant="secondary" size="sm" onClick={() => onPending(i, { tenantIndex: p.tenantIndex, force: true })}>
                      Use the passport details for Tenant {(p.tenantIndex ?? 0) + 1} anyway
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-[#f5f0e8]">Which tenant is {p.passport.name || 'this passport'} ({p.passport.passportNo || 'no. unread'})?</p>
                    <div className="flex items-center gap-2">
                      <select
                        value={tenantChoice}
                        onChange={(ev) => setTenantChoice(Number(ev.target.value))}
                        className="rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1 text-xs text-[#f5f0e8]"
                      >
                        {data.tenants.map((t, k) => (
                          <option key={k} value={k} className="bg-[#1e1a14] text-[#f5f0e8]">Tenant {k + 1}{t.name ? ` (${t.name})` : ''}</option>
                        ))}
                      </select>
                      <Button variant="secondary" size="sm" onClick={() => onPending(i, { tenantIndex: tenantChoice })}>Apply</Button>
                    </div>
                  </>
                )
              ) : p.kind === 'address' ? (
                <label className="flex flex-wrap items-center gap-2 text-[#f5f0e8]">
                  Address goes to
                  <select
                    value={p.target}
                    onChange={(ev) => onPending(i, { target: ev.target.value as AddressTarget })}
                    className="rounded-lg border border-[#332c20] bg-[#262018] px-2 py-1 text-xs text-[#f5f0e8]"
                  >
                    <option value="allLandlords" className="bg-[#1e1a14] text-[#f5f0e8]">All landlords&apos; address</option>
                    <option value="premises" className="bg-[#1e1a14] text-[#f5f0e8]">Premises</option>
                    {data.landlords.map((l, k) => (
                      <option key={k} value={`landlord:${k}`} className="bg-[#1e1a14] text-[#f5f0e8]">Landlord {k + 1}{l.name ? ` (${l.name})` : ''} only</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
