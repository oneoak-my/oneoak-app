'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, RefreshCw, LogOut, X, Upload, FileText, Check, CalendarDays } from 'lucide-react'
import { updateRecord, createRecord, createRenewal, authJsonHeaders } from '@/lib/api'
import { getExpirySources, getExpiryRemarks, saveExpiryRemark, isMissingTableError } from '@/lib/tenancyExpiryApi'
import {
  buildExpiryRows, filterExpiryRows, rangeLabel, shortDate, addMonthsYmd, todayYmdLocal, formatRental, type ExpiryRow,
} from '@/lib/tenancyExpiry'
import type { PropertyRecord, Unit } from '@/lib/types'
import { LISTER_OPTIONS } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

type RenewRec = PropertyRecord & { unit: Unit }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExpiry(r: RenewRec): string | null {
  return r.tenancy_expiry_override ?? r.tenancy_end_date
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, mo, d] = s.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(s: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [y, mo, d] = s.split('-').map(Number)
  return Math.round((new Date(y, mo - 1, d).getTime() - today.getTime()) / 86400000)
}

function subtractMonths(dateStr: string, months: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, mo - 1 - months, d)
  return dt.toISOString().split('T')[0]
}

function subtractDays(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  dt.setDate(dt.getDate() - days)
  return dt.toISOString().split('T')[0]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── WA builders ──────────────────────────────────────────────────────────────

function tenantRenewalWa(r: RenewRec): string {
  const expiry = getExpiry(r)
  const remindBy = expiry ? subtractMonths(expiry, 2) : null
  const lister = r.unit?.lister ?? ''
  const msg = [
    `*Tenancy Expiry Reminder — ${r.unit?.unit_number ?? ''}*`,
    ``,
    `Hi ${r.tenant_name ?? 'there'}, 😊`,
    ``,
    `This is a gentle reminder that your tenancy is expiring soon:`,
    `📍 *Unit:* ${r.unit?.unit_number ?? ''}`,
    `📅 *Expiry Date:* ${fmtDate(expiry)}`,
    ``,
    `As per your Tenancy Agreement, a *2-month written notice* is required should you wish to renew or vacate the unit upon expiry.`,
    ``,
    `Kindly let us know your intention to *renew or vacate* by *${fmtDate(remindBy)}*.`,
    ``,
    `Should you wish to renew, the updated tenancy terms will be shared with you upon confirmation with the Landlord.`,
    ``,
    `Please feel free to reach out if you have any questions.`,
    `Thank you! 🙏`,
    lister,
  ].join('\n')
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

function coAgentRenewalWa(r: RenewRec): string {
  const expiry = getExpiry(r)
  const remindBy = expiry ? subtractMonths(expiry, 2) : null
  const coAgentDeadline = remindBy ? subtractDays(remindBy, 7) : null
  const lister = r.unit?.lister ?? ''
  const msg = [
    `*Tenancy Expiry Reminder — ${r.unit?.unit_number ?? ''}*`,
    ``,
    `Hi ${r.co_agent_checkin ?? 'there'},`,
    ``,
    `Please be informed that the tenancy for the below unit is expiring soon:`,
    `📍 *Unit:* ${r.unit?.unit_number ?? ''}`,
    `👤 *Tenant:* ${r.tenant_name ?? ''}`,
    `📅 *Expiry Date:* ${fmtDate(expiry)}`,
    ``,
    `Kindly follow up with the tenant on whether they intend to Renew or Vacate.`,
    ``,
    `Please revert to me by *${fmtDate(coAgentDeadline)}*.`,
    ``,
    `Thank you! 🙏`,
    lister,
  ].join('\n')
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

// ── WaPopup ───────────────────────────────────────────────────────────────────

function WaPopup({ record, onClose }: { record: RenewRec; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-50 bg-[#1e1a14] border border-[#332c20] rounded-xl shadow-xl p-2 min-w-[180px]"
    >
      <a
        href={tenantRenewalWa(record)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#262018] text-sm text-[#f5f0e8] transition-colors"
        onClick={onClose}
      >
        <MessageCircle size={14} className="text-green-400" />
        Message Tenant
      </a>
      {record.co_agent_checkin && (
        <a
          href={coAgentRenewalWa(record)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#262018] text-sm text-[#f5f0e8] transition-colors"
          onClick={onClose}
        >
          <MessageCircle size={14} className="text-blue-400" />
          Message Co-Agent
        </a>
      )}
    </div>
  )
}

// ── VacateConfirmModal ────────────────────────────────────────────────────────

function VacateConfirmModal({
  record,
  onClose,
  onVacated,
}: {
  record: RenewRec
  onClose: () => void
  onVacated: (checkoutId: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function confirm() {
    setSaving(true)
    setErr(null)
    try {
      const checkout = await createRecord({
        unit_id: record.unit_id,
        type: 'checkout',
        tenant_name: record.tenant_name,
        date: getExpiry(record) ?? new Date().toISOString().split('T')[0],
        monthly_rental: record.monthly_rental,
        security_deposit: record.security_deposit,
        utility_deposit: record.utility_deposit,
        status: 'active',
      })
      await updateRecord(record.id, { renewal_action: 'vacate' })
      onVacated(checkout.id)
    } catch (e) {
      setErr(String(e))
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} size="sm">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#f5f0e8] mb-2">Confirm Vacating</h2>
          <p className="text-sm text-[#a89d84] leading-relaxed">
            A new check-out record will be created for{' '}
            <span className="text-[#f5f0e8] font-medium">{record.tenant_name}</span> at{' '}
            <span className="text-[#f5f0e8] font-medium">{record.unit?.unit_number}</span> with
            move-out date{' '}
            <span className="text-[#f5f0e8] font-medium">{fmtDate(getExpiry(record))}</span>.
          </p>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} fullWidth>Cancel</Button>
          <Button variant="danger" onClick={confirm} disabled={saving} loading={saving} fullWidth>
            Confirm Vacate
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── RenewalModal ──────────────────────────────────────────────────────────────

interface RenewalForm {
  landlord_name: string
  tenant_name: string
  unit_address: string
  old_rental: string
  new_rental: string
  old_deposit: string
  new_deposit: string
  top_up_amount: string
  tenancy_start_date: string
  tenancy_end_date: string
  tenancy_length: string
  signing_date: string
}

function fmtRM(v: string): string {
  const n = parseFloat(v)
  return isNaN(n) ? '—' : `RM ${n.toFixed(2)}`
}

function RenewalModal({
  record,
  onClose,
  onSaved,
}: {
  record: RenewRec
  onClose: () => void
  onSaved: () => void
}) {
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<RenewalForm>({
    landlord_name: '',
    tenant_name: record.tenant_name ?? '',
    unit_address: [record.unit?.unit_number, record.unit?.building].filter(Boolean).join(', '),
    old_rental: record.monthly_rental != null ? String(record.monthly_rental) : '',
    new_rental: '',
    old_deposit: record.security_deposit != null ? String(record.security_deposit) : '',
    new_deposit: '',
    top_up_amount: '',
    tenancy_start_date: '',
    tenancy_end_date: '',
    tenancy_length: '1 year',
    signing_date: new Date().toISOString().split('T')[0],
  })

  function set(k: keyof RenewalForm, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  // Auto-compute top-up when deposits change
  useEffect(() => {
    const oldDep = parseFloat(form.old_deposit) || 0
    const newDep = parseFloat(form.new_deposit) || 0
    const topUp = newDep - oldDep
    setForm((prev) => ({ ...prev, top_up_amount: topUp > 0 ? String(topUp) : '' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.old_deposit, form.new_deposit])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setReading(true)
    setErr(null)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/read-document', {
        method: 'POST',
        headers: await authJsonHeaders(),
        body: JSON.stringify({ base64, mimeType: file.type || 'image/jpeg' }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setForm((prev) => ({
        ...prev,
        landlord_name: data.landlord_name ?? prev.landlord_name,
        tenant_name: data.tenant_name ?? prev.tenant_name,
        unit_address: data.unit_address ?? prev.unit_address,
        old_rental: data.monthly_rental != null ? String(data.monthly_rental) : prev.old_rental,
        tenancy_start_date: data.tenancy_start_date ?? prev.tenancy_start_date,
        tenancy_end_date: data.tenancy_end_date ?? prev.tenancy_end_date,
        old_deposit: data.security_deposit != null ? String(data.security_deposit) : prev.old_deposit,
      }))
    } catch (e) {
      setErr(`Could not read document: ${e}`)
    } finally {
      setReading(false)
    }
  }

  async function downloadPdf() {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const bold = await doc.embedFont(StandardFonts.HelveticaBold)
      const regular = await doc.embedFont(StandardFonts.Helvetica)

      const page = doc.addPage([595.28, 841.89])
      const ink = rgb(0.05, 0.05, 0.05)
      const muted = rgb(0.35, 0.35, 0.35)
      const gold = rgb(0.55, 0.47, 0.27)
      const M = 60
      let y = 780

      const line = (label: string, value: string) => {
        page.drawText(label, { x: M, y, size: 10, font: bold, color: muted })
        page.drawText(value, { x: M + 170, y, size: 10, font: regular, color: ink })
        y -= 19
      }

      page.drawText('TENANCY RENEWAL LETTER', { x: M, y, size: 17, font: bold, color: ink })
      y -= 10
      page.drawLine({ start: { x: M, y }, end: { x: 535, y }, thickness: 0.5, color: gold })
      y -= 22

      page.drawText(`Date: ${fmtDate(form.signing_date)}`, { x: M, y, size: 10, font: regular, color: muted })
      y -= 28

      line('Unit:', form.unit_address)
      line('Landlord:', form.landlord_name || '—')
      line('Tenant:', form.tenant_name || '—')
      y -= 14

      page.drawText('Tenancy Terms', { x: M, y, size: 12, font: bold, color: ink })
      y -= 20
      line('New Tenancy Period:', `${fmtDate(form.tenancy_start_date)} – ${fmtDate(form.tenancy_end_date)}`)
      line('Duration:', form.tenancy_length)
      y -= 14

      page.drawText('Financial Summary', { x: M, y, size: 12, font: bold, color: ink })
      y -= 20
      line('Previous Monthly Rental:', fmtRM(form.old_rental))
      line('New Monthly Rental:', fmtRM(form.new_rental))
      line('Previous Deposit:', fmtRM(form.old_deposit))
      line('New Deposit:', fmtRM(form.new_deposit))
      if (form.top_up_amount && parseFloat(form.top_up_amount) > 0) {
        line('Top-up Deposit Required:', fmtRM(form.top_up_amount))
      }
      y -= 40

      page.drawText('We look forward to your continued tenancy. Thank you.', {
        x: M, y, size: 10, font: regular, color: ink,
      })
      y -= 60

      page.drawText('Landlord: ________________________________', { x: M, y, size: 10, font: regular, color: ink })
      y -= 26
      page.drawText('Tenant: __________________________________', { x: M, y, size: 10, font: regular, color: ink })

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), `renewal-${record.unit?.unit_number ?? 'unit'}.pdf`)
    } catch (e) {
      setErr(`PDF generation failed: ${e}`)
    }
  }

  async function downloadWord() {
    try {
      const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx')

      const row = (label: string, value: string) => {
        return new Paragraph({
          children: [
            new TextRun({ text: label, bold: true }),
            new TextRun({ text: `   ${value}` }),
          ],
          spacing: { after: 100 },
        })
      }

      const topUpRows =
        form.top_up_amount && parseFloat(form.top_up_amount) > 0
          ? [row('Top-up Deposit Required:', fmtRM(form.top_up_amount))]
          : []

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'TENANCY RENEWAL LETTER', bold: true, size: 34 })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                children: [new TextRun({ text: `Date: ${fmtDate(form.signing_date)}` })],
                spacing: { after: 300 },
              }),
              row('Unit:', form.unit_address),
              row('Landlord:', form.landlord_name || '—'),
              row('Tenant:', form.tenant_name || '—'),
              new Paragraph({ text: '', spacing: { after: 200 } }),
              new Paragraph({
                children: [new TextRun({ text: 'Tenancy Terms', bold: true, size: 26 })],
                spacing: { after: 150 },
              }),
              row('New Tenancy Period:', `${fmtDate(form.tenancy_start_date)} – ${fmtDate(form.tenancy_end_date)}`),
              row('Duration:', form.tenancy_length),
              new Paragraph({ text: '', spacing: { after: 200 } }),
              new Paragraph({
                children: [new TextRun({ text: 'Financial Summary', bold: true, size: 26 })],
                spacing: { after: 150 },
              }),
              row('Previous Monthly Rental:', fmtRM(form.old_rental)),
              row('New Monthly Rental:', fmtRM(form.new_rental)),
              row('Previous Deposit:', fmtRM(form.old_deposit)),
              row('New Deposit:', fmtRM(form.new_deposit)),
              ...topUpRows,
              new Paragraph({ text: '', spacing: { after: 400 } }),
              new Paragraph({
                children: [new TextRun('We look forward to your continued tenancy. Thank you.')],
                spacing: { after: 600 },
              }),
              new Paragraph({
                children: [new TextRun('Landlord: ________________________________')],
                spacing: { after: 200 },
              }),
              new Paragraph({
                children: [new TextRun('Tenant: __________________________________')],
                spacing: { after: 200 },
              }),
            ],
          },
        ],
      })

      const blob = await Packer.toBlob(doc)
      downloadBlob(blob, `renewal-${record.unit?.unit_number ?? 'unit'}.docx`)
    } catch (e) {
      setErr(`Word generation failed: ${e}`)
    }
  }

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      await createRenewal({
        record_id: record.id,
        unit_id: record.unit_id,
        landlord_name: form.landlord_name || null,
        tenant_name: form.tenant_name || null,
        unit_address: form.unit_address || null,
        old_rental: form.old_rental ? parseFloat(form.old_rental) : null,
        new_rental: form.new_rental ? parseFloat(form.new_rental) : null,
        old_deposit: form.old_deposit ? parseFloat(form.old_deposit) : null,
        new_deposit: form.new_deposit ? parseFloat(form.new_deposit) : null,
        top_up_amount: form.top_up_amount ? parseFloat(form.top_up_amount) : null,
        tenancy_start_date: form.tenancy_start_date || null,
        tenancy_end_date: form.tenancy_end_date || null,
        tenancy_length: form.tenancy_length || null,
        signing_date: form.signing_date || null,
        renewal_letter_url: null,
      })
      await updateRecord(record.id, { renewal_action: 'renew' })
      onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  const labelCls = 'text-[11px] text-[#7c6f54] mb-1 block font-medium uppercase tracking-wider'

  return (
    <Modal open={true} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#f5f0e8]">Renewal Letter</h2>
            <p className="text-xs text-[#7c6f54]">{record.unit?.unit_number} · {record.tenant_name}</p>
          </div>
          <button onClick={onClose} className="text-[#7c6f54] hover:text-[#f5f0e8] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* TA upload for auto-fill */}
        <div className="rounded-xl border border-[#332c20] bg-[#141108] p-4 space-y-2">
          <p className={labelCls}>Auto-fill from Tenancy Agreement</p>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#332c20] bg-[#1e1a14] hover:bg-[#262018] text-sm text-[#a89d84] transition-colors disabled:opacity-50"
            >
              <Upload size={14} />
              {reading ? 'Reading…' : 'Upload TA'}
            </button>
            {reading && <span className="text-xs text-[#7c6f54]">Claude is reading the document…</span>}
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Unit Address</label>
            <Input value={form.unit_address} onChange={(e) => set('unit_address', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Landlord</label>
            <Input value={form.landlord_name} onChange={(e) => set('landlord_name', e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className={labelCls}>Tenant</label>
            <Input value={form.tenant_name} onChange={(e) => set('tenant_name', e.target.value)} placeholder="Name" />
          </div>

          <div>
            <label className={labelCls}>Previous Rental (RM)</label>
            <Input type="number" value={form.old_rental} onChange={(e) => set('old_rental', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>New Rental (RM)</label>
            <Input type="number" value={form.new_rental} onChange={(e) => set('new_rental', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Previous Deposit (RM)</label>
            <Input type="number" value={form.old_deposit} onChange={(e) => set('old_deposit', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>New Deposit (RM)</label>
            <Input type="number" value={form.new_deposit} onChange={(e) => set('new_deposit', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Top-up Amount (RM)</label>
            <Input type="number" value={form.top_up_amount} onChange={(e) => set('top_up_amount', e.target.value)} placeholder="Auto-computed" />
          </div>

          <div>
            <label className={labelCls}>New Tenancy Start</label>
            <Input type="date" value={form.tenancy_start_date} onChange={(e) => set('tenancy_start_date', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>New Tenancy End</label>
            <Input type="date" value={form.tenancy_end_date} onChange={(e) => set('tenancy_end_date', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Duration</label>
            <Input value={form.tenancy_length} onChange={(e) => set('tenancy_length', e.target.value)} placeholder="e.g. 1 year" />
          </div>
          <div>
            <label className={labelCls}>Signing Date</label>
            <Input type="date" value={form.signing_date} onChange={(e) => set('signing_date', e.target.value)} />
          </div>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#332c20]">
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#332c20] bg-[#1e1a14] hover:bg-[#262018] text-sm text-[#a89d84] transition-colors"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={downloadWord}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#332c20] bg-[#1e1a14] hover:bg-[#262018] text-sm text-[#a89d84] transition-colors"
          >
            <FileText size={14} /> Word
          </button>
          <div className="flex-1" />
          <Button variant="primary" onClick={handleSave} disabled={saving} loading={saving}>
            Save Renewal
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Page: Tenancy Expiry overview ─────────────────────────────────────────────
// One row per unit with its latest expiry, from check-in records AND renewals (records of type "renewal" and
// renewals saved with the Renew button). Remarks are stored per unit in tenancy_expiry_remarks.

const selectCls =
  'bg-[#1e1a14] border border-[#332c20] text-[#f5f0e8] text-xs rounded-lg px-2.5 py-1.5 appearance-none pr-6 focus:outline-none focus:border-gold-500/50 cursor-pointer'
const dateCls =
  'bg-[#1e1a14] border border-[#332c20] text-[#f5f0e8] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gold-500/50'

function RemarkInput({ value, onSave, disabled }: { value: string; onSave: (v: string) => Promise<void>; disabled?: boolean }) {
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => { setDraft(value) }, [value])
  async function blur() {
    if (draft.trim() === value.trim()) return
    setState('saving')
    try {
      await onSave(draft)
      setState('saved')
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } catch {
      setState('error')
    }
  }
  return (
    <div className="flex items-start gap-1.5">
      <textarea
        rows={1}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={blur}
        placeholder={disabled ? 'Remarks need the SQL' : 'Add remark…'}
        className="w-full min-w-[140px] resize-y rounded-lg border border-[#332c20] bg-[#1e1a14] px-2 py-1 text-xs text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/50 disabled:opacity-50"
      />
      <span className="w-4 shrink-0 pt-1 text-[11px]">
        {state === 'saving' && <span className="text-[#7c6f54]">…</span>}
        {state === 'saved' && <Check size={13} className="text-emerald-300" aria-label="Saved" />}
        {state === 'error' && <span className="text-orange-300" title="Not saved">!</span>}
      </span>
    </div>
  )
}

function ActionsMenu({ row, onRenew, onVacate }: { row: ExpiryRow; onRenew: (r: RenewRec) => void; onVacate: (r: RenewRec) => void }) {
  const [waOpen, setWaOpen] = useState(false)
  const base = (row.record ?? row.checkin) as RenewRec | null
  if (!base) return null
  const rec = { ...base, unit: base.unit ?? ({ id: row.unitId, unit_number: row.unitNo, building: row.building } as Unit) } as RenewRec
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative inline-block">
        <button onClick={() => setWaOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-600/50 hover:text-green-400 transition-colors" title="Send WhatsApp reminder">
          <MessageCircle size={15} />
        </button>
        {waOpen && <WaPopup record={rec} onClose={() => setWaOpen(false)} />}
      </div>
      <button onClick={() => onRenew(rec)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 text-[11px] font-medium transition-colors">
        <RefreshCw size={11} /> Renew
      </button>
      <button onClick={() => onVacate(rec)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1e1a14] hover:bg-red-500/10 border border-[#332c20] hover:border-red-500/30 text-[#7c6f54] hover:text-red-400 text-[11px] font-medium transition-colors">
        <LogOut size={11} /> Vacate
      </button>
    </div>
  )
}

export default function RenewalPage() {
  const router = useRouter()
  const today = todayYmdLocal()
  const [rows, setRows] = useState<ExpiryRow[]>([])
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [remarksMissing, setRemarksMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addMonthsYmd(today, 3))
  const [includeExpired, setIncludeExpired] = useState(false)
  const [listerFilter, setListerFilter] = useState('All')
  const [includeRemarks, setIncludeRemarks] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [vacatingRecord, setVacatingRecord] = useState<RenewRec | null>(null)
  const [renewingRecord, setRenewingRecord] = useState<RenewRec | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { records, renewals } = await getExpirySources()
      setRows(buildExpiryRows({ units: [], records, renewals }))
      try {
        setRemarks(await getExpiryRemarks())
        setRemarksMissing(false)
      } catch (e) {
        if (isMissingTableError(e)) setRemarksMissing(true)
        else throw e
      }
    } catch (e) {
      setError(`Could not load tenancies: ${(e as Error)?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const lo = from <= to ? from : to
  const hi = from <= to ? to : from
  const filtered = filterExpiryRows(rows, lo, hi, today, includeExpired)
    .filter((r) => listerFilter === 'All' || (r.record?.unit ?? r.checkin?.unit)?.lister === listerFilter)
  const label = rangeLabel(lo, hi)

  async function saveRemark(key: string, value: string) {
    await saveExpiryRemark(key, value)
    setRemarks((prev) => ({ ...prev, [key]: value.trim() }))
  }

  async function generatePdf() {
    setPdfBusy(true)
    try {
      const [{ buildExpiryPdf, expiryPdfFileName }, { loadAgreementFonts }] = await Promise.all([
        import('@/lib/tenancyExpiryPdf'), import('@/lib/tenancy/pdfFonts'),
      ])
      const fonts = await loadAgreementFonts()
      const bytes = await buildExpiryPdf(filtered, { label, includeRemarks, remarks }, fonts)
      downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), expiryPdfFileName(label))
    } catch (e) {
      setError(`Could not build the PDF: ${(e as Error)?.message ?? e}`)
    } finally {
      setPdfBusy(false)
    }
  }

  const days = (exp: string) => daysUntil(exp)
  const expiryCls = (exp: string) => (days(exp) < 0 ? 'text-red-400' : days(exp) <= 60 ? 'text-orange-300' : 'text-[#f5f0e8]')
  const blank = <span className="text-[#5c5040]">—</span>

  return (
    <div className="py-5 space-y-4">
      {/* Section nav */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <Link
          href="/schedule"
          className="flex items-center gap-2.5 p-3.5 rounded-xl border border-[#332c20] bg-[#1e1a14] hover:border-gold-500/40 hover:bg-[#262018] transition-colors"
        >
          <CalendarDays size={17} className="text-[#7c6f54]" />
          <span className="text-sm font-bold text-[#f5f0e8]">Check-in Schedule</span>
        </Link>
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl border-2 border-gold-500/50 bg-gold-500/10">
          <RefreshCw size={17} className="text-gold-400" />
          <span className="text-sm font-bold text-[#f5f0e8]">Tenancy Expiry</span>
        </div>
      </div>

      {/* Header */}
      <div className="px-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#f5f0e8]">Tenancy Expiry</h1>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#7c6f54] hover:text-[#f5f0e8] transition-colors" title="Refresh (re-reads check-ins and renewals)">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Date selection */}
      <div className="mx-4 bg-[#262018] p-3 rounded-xl flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-[11px] text-[#a89d84]">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value || today)} className={dateCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[#a89d84]">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value || addMonthsYmd(today, 3))} className={dateCls} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#a89d84] pb-1.5">
          <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} />
          Include already expired
        </label>
        <div className="relative pb-0.5">
          <select value={listerFilter} onChange={(e) => setListerFilter(e.target.value)} className={selectCls}>
            <option value="All">All Listers</option>
            {LISTER_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
        </div>
      </div>

      {/* Count + PDF */}
      <div className="px-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#a89d84]">
          {loading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'tenancy expires' : 'tenancies expire'} between ${shortDate(lo)} and ${shortDate(hi)}${includeExpired ? ' (including already expired)' : ''}`}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#a89d84]">
            <input type="checkbox" checked={includeRemarks} onChange={(e) => setIncludeRemarks(e.target.checked)} />
            Include remarks
          </label>
          <Button variant="primary" size="sm" icon={<FileText size={14} />} loading={pdfBusy} disabled={loading} onClick={generatePdf}>
            Generate Tenancy Expiry List (PDF)
          </Button>
        </div>
      </div>

      {error && <p className="mx-4 rounded-xl border border-orange-500/30 bg-orange-500/20 px-3 py-2 text-xs text-orange-300">{error}</p>}
      {remarksMissing && (
        <p className="mx-4 rounded-xl border border-orange-500/30 bg-orange-500/20 px-3 py-2 text-xs text-orange-300">
          Remarks are not available yet: run supabase/tenancy_expiry_remarks.sql in Supabase, then refresh.
        </p>
      )}

      {!loading && filtered.length === 0 && <p className="px-4 text-sm text-[#7c6f54]">No tenancies expire in this period.</p>}

      {/* Phone: cards */}
      {filtered.length > 0 && (
        <div className="px-4 space-y-3 md:hidden">
          {filtered.map((r, i) => (
            <div key={r.unitId} className="rounded-xl border border-[#332c20] bg-[#1e1a14] p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#7c6f54]">#{i + 1} · {r.source === 'renewal' ? 'Renewal' : 'Check-in'}</p>
                  <a href={`/units/${r.unitId}`} className="text-sm font-semibold text-gold-400">{r.unitNo}{r.building ? `, ${r.building}` : ''}</a>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${expiryCls(r.expiry)}`}>{shortDate(r.expiry)}</p>
                  <p className="text-[10px] text-[#7c6f54]">{days(r.expiry) < 0 ? `${Math.abs(days(r.expiry))}d ago` : `${days(r.expiry)}d`}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-[#7c6f54]">Owner</span><span className="text-[#f5f0e8]">{r.owner ?? blank}</span>
                <span className="text-[#7c6f54]">Tenant</span><span className="text-[#f5f0e8]">{r.tenant ?? blank}</span>
                <span className="text-[#7c6f54]">Rental (RM)</span><span className="text-[#f5f0e8]">{r.rental != null ? formatRental(r.rental) : blank}</span>
                <span className="text-[#7c6f54]">Original TA start</span><span className="text-[#f5f0e8]">{r.originalStart ? shortDate(r.originalStart) : blank}</span>
                <span className="text-[#7c6f54]">COA</span><span className="text-[#f5f0e8]">{r.coaName ?? blank}</span>
              </div>
              <RemarkInput value={remarks[r.sourceKey] ?? ''} disabled={remarksMissing} onSave={(v) => saveRemark(r.sourceKey, v)} />
              <ActionsMenu row={r} onRenew={setRenewingRecord} onVacate={setVacatingRecord} />
            </div>
          ))}
        </div>
      )}

      {/* Wider screens: table */}
      {filtered.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#332c20]">
                {['No', 'Expiry Date', 'Property', 'Owner / Tenant', 'Rental (RM)', 'Original TA Start Date', 'COA Name', 'Remark', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#f5f0e8] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.unitId} className="border-b border-[#332c20]/40 hover:bg-[#1e1a14] align-top transition-colors">
                  <td className="px-3 py-3 text-xs text-[#a89d84]">{i + 1}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs ${expiryCls(r.expiry)}`}>{shortDate(r.expiry)}</span>
                    <span className="block text-[10px] text-[#7c6f54]">{days(r.expiry) < 0 ? `${Math.abs(days(r.expiry))}d ago` : `${days(r.expiry)}d`} · {r.source === 'renewal' ? 'renewal' : 'check-in'}</span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <a href={`/units/${r.unitId}`} className="text-gold-400 hover:text-gold-300 font-medium">{r.unitNo}</a>
                    {r.building && <span className="block text-[#a89d84]">{r.building}</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-[#f5f0e8]">
                    <span className="block">{r.owner ?? blank}</span>
                    <span className="block text-[#a89d84]">{r.tenant ?? blank}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-[#f5f0e8] whitespace-nowrap">{r.rental != null ? formatRental(r.rental) : blank}</td>
                  <td className="px-3 py-3 text-xs text-[#f5f0e8] whitespace-nowrap">{r.originalStart ? shortDate(r.originalStart) : blank}</td>
                  <td className="px-3 py-3 text-xs text-[#f5f0e8]">{r.coaName ?? blank}</td>
                  <td className="px-3 py-3 w-56"><RemarkInput value={remarks[r.sourceKey] ?? ''} disabled={remarksMissing} onSave={(v) => saveRemark(r.sourceKey, v)} /></td>
                  <td className="px-3 py-3"><ActionsMenu row={r} onRenew={setRenewingRecord} onVacate={setVacatingRecord} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {vacatingRecord && (
        <VacateConfirmModal
          record={vacatingRecord}
          onClose={() => setVacatingRecord(null)}
          onVacated={(id) => router.push(`/records/${id}`)}
        />
      )}
      {renewingRecord && (
        <RenewalModal
          record={renewingRecord}
          onClose={() => setRenewingRecord(null)}
          onSaved={() => { setRenewingRecord(null); load() }}
        />
      )}
    </div>
  )
}
