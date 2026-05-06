'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Plus, Trash2, Edit2, Share2, Upload, Check, Clock, X,
  ChevronDown, ChevronUp, Paperclip,
} from 'lucide-react'
import {
  getRecord, updateRecord, deleteRecord,
  createService, updateService, deleteService,
  getServiceProviders, getServiceDescriptions, uploadInvoice, createServiceProvider,
  markReportGenerated, extractError,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { PropertyRecord, Service, ServiceProvider, ServiceDescription, RecordType, PaymentBy } from '@/lib/types'
import { PAYMENT_STATUS_LABELS, UTILITY_OPTIONS, PAYMENT_BY_CHECKOUT, PAYMENT_BY_OTHER, PAYMENT_BY_COLORS } from '@/lib/types'
import {
  formatDate, formatCurrency, calcRefund,
  generateMoveInReport, generateMoveOutReport, generateMaintenanceReport,
} from '@/lib/utils'
import Badge, { statusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card, { CardRow } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Input, { Select, Textarea } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import TaskSection from '@/components/tasks/TaskSection'

// ── Renewal helpers ───────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function detectIdType(id: string | null | undefined): string {
  if (!id) return 'ID No'
  const t = id.trim()
  if (/\d+-[A-Za-z]$/.test(t)) return 'Company No'
  if (/^[\d-]+$/.test(t)) return 'NRIC No'
  return 'Passport No'
}

function ordSuffix(n: number): string {
  if (n >= 11 && n <= 13) return 'th'
  const s = n % 10
  if (s === 1) return 'st'
  if (s === 2) return 'nd'
  if (s === 3) return 'rd'
  return 'th'
}

function computeRenewalLength(start: string | null, end: string | null, custom?: string | null): string {
  if (custom) return custom
  if (!start || !end) return '—'
  const s = new Date(start)
  const e = new Date(end)
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (months % 12 === 0) {
    const y = months / 12
    return `${y} year${y !== 1 ? 's' : ''}`
  }
  return `${months} months`
}

function fmtDateLetter(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  const day = d.getDate()
  const mon = d.toLocaleString('en', { month: 'short' }).toUpperCase()
  return `${day}${ordSuffix(day)} ${mon} ${d.getFullYear()}`
}

function fmtRMLetter(n: number | null | undefined): string {
  if (n == null) return '0'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

async function downloadRenewalPdf(record: PropertyRecord, useTopup: boolean): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  const [PW, PH] = [595.28, 841.89]
  const M = 55
  const CW = PW - M * 2
  const ink = rgb(0.05, 0.04, 0.03)
  const mid = rgb(0.30, 0.27, 0.22)

  const page = doc.addPage([PW, PH])
  let y = PH - M

  // ── Title (centered, bold, underlined) ─────────────────────────────────────
  const title = 'TENANCY RENEWAL AGREEMENT'
  const tSize = 14
  const titleW = bold.widthOfTextAtSize(title, tSize)
  const titleX = (PW - titleW) / 2
  page.drawText(title, { x: titleX, y, size: tSize, font: bold, color: ink })
  page.drawLine({ start: { x: titleX, y: y - 1 }, end: { x: titleX + titleW, y: y - 1 }, thickness: 0.8, color: ink })
  y -= 28

  // ── Preamble (inline mixed bold/regular) ────────────────────────────────────
  const landlordIdType = detectIdType(record.landlord_id)
  const tenantIdType = detectIdType(record.tenant_id)
  const renewalLen = computeRenewalLength(record.renewal_start_date, record.renewal_end_date, record.renewal_length_custom)

  type Seg = { text: string; bold?: boolean }

  const drawMixed = (segs: Seg[], startX = M, size = 10, lineH = 14): void => {
    const maxLineW = CW - (startX - M)
    let lx = startX
    let lineW = 0
    let firstOnLine = true

    const emitWord = (word: string, isBold: boolean) => {
      const f = isBold ? bold : regular
      const spW = regular.widthOfTextAtSize(' ', size)
      const wW = f.widthOfTextAtSize(word, size)
      const need = firstOnLine ? wW : spW + wW
      if (!firstOnLine && lineW + need > maxLineW) {
        y -= lineH
        lx = startX
        lineW = 0
        firstOnLine = true
      }
      if (!firstOnLine) { lx += spW; lineW += spW }
      page.drawText(word, { x: lx, y, size, font: f, color: ink })
      lx += wW
      lineW += wW
      firstOnLine = false
    }

    for (const seg of segs) {
      const words = seg.text.split(/\s+/).filter(Boolean)
      for (const w of words) emitWord(w, seg.bold ?? false)
    }
    if (!firstOnLine) y -= lineH
  }

  drawMixed([
    { text: 'The Tenancy Renewal Agreement ("Agreement") is made by and between the "Landlord",' },
    { text: ` ${record.landlord_name ?? '—'} (${landlordIdType}: ${record.landlord_id ?? '—'}),`, bold: true },
    { text: ' and the "Tenant",' },
    { text: ` ${record.tenant_name ?? '—'} (${tenantIdType}: ${record.tenant_id ?? '—'})`, bold: true },
    { text: ' for the premise located at' },
    { text: ` ${record.unit_full_address ?? '—'}.`, bold: true },
  ])
  y -= 10

  // ── Bullet helper ───────────────────────────────────────────────────────────
  const bulletMixed = (segs: Seg[]): void => {
    const indent = M + 14
    const maxW = CW - 14
    page.drawText('-', { x: M, y, size: 10, font: regular, color: ink })
    let lx = indent
    let lineW = 0
    let firstOnLine = true

    const emitWord = (word: string, isBold: boolean) => {
      const f = isBold ? bold : regular
      const spW = regular.widthOfTextAtSize(' ', 10)
      const wW = f.widthOfTextAtSize(word, 10)
      const need = firstOnLine ? wW : spW + wW
      if (!firstOnLine && lineW + need > maxW) {
        y -= 14
        lx = indent
        lineW = 0
        firstOnLine = true
      }
      if (!firstOnLine) { lx += spW; lineW += spW }
      page.drawText(word, { x: lx, y, size: 10, font: f, color: ink })
      lx += wW
      lineW += wW
      firstOnLine = false
    }

    for (const seg of segs) {
      const words = seg.text.split(/\s+/).filter(Boolean)
      for (const w of words) emitWord(w, seg.bold ?? false)
    }
    if (!firstOnLine) y -= 14
    y -= 4
  }

  const bullet = (text: string): void => bulletMixed([{ text }])

  // ── Deposit values ─────────────────────────────────────────────────────────
  const prevSec = record.prev_security_deposit ?? 0
  const prevUtil = record.prev_utility_deposit ?? 0
  const newSec = useTopup ? (record.new_security_deposit ?? 0) : prevSec
  const newUtil = useTopup ? (record.new_utility_deposit ?? 0) : prevUtil
  const secTop = useTopup ? Math.max(0, newSec - prevSec) : 0
  const utilTop = useTopup ? Math.max(0, newUtil - prevUtil) : 0

  // ── Clauses ────────────────────────────────────────────────────────────────
  bullet(`With reference to the Tenancy Agreement dated ${fmtDateLetter(record.original_ta_date)}.`)
  bullet(`Please be informed that the Tenancy Agreement is ending on ${fmtDateLetter(record.tenancy_end_date)}.`)
  bulletMixed([
    { text: `Both the Landlord and the Tenant have confirmed the renewal of the Tenancy Agreement for a further term of ${renewalLen} at a monthly rental of ` },
    { text: `RM ${fmtRMLetter(record.monthly_rental)}.`, bold: true },
  ])
  bullet(useTopup
    ? 'The Tenant is required to pay the following for renewal of the Tenancy Agreement:'
    : 'The Deposits amount remained the same for the renewal of the Tenancy Agreement:')
  y -= 4

  // ── Deposits table ─────────────────────────────────────────────────────────
  const tX = M + 14
  const colW = [185, 95, 110, 80]
  const headers = ['Description', 'New Tenancy (RM)', 'Previous Tenancy (RM)', 'Top-Up (RM)']
  const rowH = 18
  const tableW = colW.reduce((a, b) => a + b, 0)
  const headerY = y

  const drawRow = (cells: string[], isHeader: boolean, isTotal: boolean) => {
    const bg = isHeader ? rgb(0.93, 0.89, 0.80) : isTotal ? rgb(0.95, 0.92, 0.86) : null
    if (bg) page.drawRectangle({ x: tX, y: y - rowH + 4, width: tableW, height: rowH, color: bg })
    let cx = tX + 5
    cells.forEach((cell, ci) => {
      const f = (isHeader || isTotal) ? bold : regular
      page.drawText(cell, { x: cx, y: y - 11, size: 9, font: f, color: ink })
      cx += colW[ci]
    })
    // horizontal line
    page.drawLine({ start: { x: tX, y: y - rowH + 4 }, end: { x: tX + tableW, y: y - rowH + 4 }, thickness: 0.3, color: mid })
    y -= rowH
  }

  drawRow(headers, true, false)
  drawRow(['Security Deposit', fmtRMLetter(newSec), fmtRMLetter(prevSec), fmtRMLetter(secTop)], false, false)
  drawRow(['Utilities Deposit', fmtRMLetter(newUtil), fmtRMLetter(prevUtil), fmtRMLetter(utilTop)], false, false)
  drawRow(['Total', fmtRMLetter(newSec + newUtil), fmtRMLetter(prevSec + prevUtil), fmtRMLetter(secTop + utilTop)], false, true)

  // outer border
  page.drawRectangle({ x: tX, y, width: tableW, height: headerY - y, borderColor: mid, borderWidth: 0.5 })
  // vertical column dividers
  let vx = tX
  colW.slice(0, -1).forEach((w) => {
    vx += w
    page.drawLine({ start: { x: vx, y }, end: { x: vx, y: headerY + 4 }, thickness: 0.3, color: mid })
  })
  y -= 10

  // ── Remaining clauses ──────────────────────────────────────────────────────
  bulletMixed([
    { text: 'The said extension shall effect from ' },
    { text: fmtDateLetter(record.renewal_start_date), bold: true },
    { text: ' till ' },
    { text: fmtDateLetter(record.renewal_end_date), bold: true },
    { text: ` and is subject to the terms and conditions as contained in the Tenancy Agreement dated ` },
    { text: fmtDateLetter(record.original_ta_date) + '.', bold: true },
  ])
  bullet('In the event of any inconsistency between the terms of this Letter and the Tenancy Agreement, the terms of this Letter shall prevail.')
  if (record.additional_terms?.trim()) {
    bullet(record.additional_terms.trim())
  }
  y -= 12

  page.drawText('In witness whereof the parties hereby agreed on the above mentioned terms and conditions:', {
    x: M, y, size: 10, font: regular, color: ink,
  })
  y -= 36

  // ── Signature ──────────────────────────────────────────────────────────────
  const col1X = M
  const col2X = M + CW / 2 + 10

  page.drawText("TENANT'S ACCEPTANCE", { x: col1X, y, size: 10, font: bold, color: ink })
  page.drawText("LANDLORD'S ACCEPTANCE", { x: col2X, y, size: 10, font: bold, color: ink })
  y -= 36

  page.drawLine({ start: { x: col1X, y }, end: { x: col1X + 190, y }, thickness: 0.7, color: mid })
  page.drawLine({ start: { x: col2X, y }, end: { x: col2X + 190, y }, thickness: 0.7, color: mid })
  y -= 14

  page.drawText('Signature', { x: col1X, y, size: 9, font: regular, color: mid })
  page.drawText('Signature', { x: col2X, y, size: 9, font: regular, color: mid })
  y -= 20

  page.drawText(`Name: ${record.tenant_name ?? '—'}`, { x: col1X, y, size: 10, font: bold, color: ink })
  page.drawText(`Name: ${record.landlord_name ?? '—'}`, { x: col2X, y, size: 10, font: bold, color: ink })
  y -= 16

  page.drawText(`${tenantIdType}: ${record.tenant_id ?? '—'}`, { x: col1X, y, size: 10, font: bold, color: ink })
  page.drawText(`${landlordIdType}: ${record.landlord_id ?? '—'}`, { x: col2X, y, size: 10, font: bold, color: ink })

  const bytes = await doc.save()
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `renewal-letter-${record.unit?.unit_number ?? 'unit'}.pdf`; a.click()
  URL.revokeObjectURL(url)
}

async function downloadRenewalWord(record: PropertyRecord, useTopup: boolean): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
    UnderlineType,
  } = await import('docx')

  const landlordIdType = detectIdType(record.landlord_id)
  const tenantIdType = detectIdType(record.tenant_id)
  const renewalLen = computeRenewalLength(record.renewal_start_date, record.renewal_end_date, record.renewal_length_custom)

  const prevSec = record.prev_security_deposit ?? 0
  const prevUtil = record.prev_utility_deposit ?? 0
  const newSec = useTopup ? (record.new_security_deposit ?? 0) : prevSec
  const newUtil = useTopup ? (record.new_utility_deposit ?? 0) : prevUtil
  const secTop = useTopup ? Math.max(0, newSec - prevSec) : 0
  const utilTop = useTopup ? Math.max(0, newUtil - prevUtil) : 0

  const SZ = 20
  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'auto' }
  const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideHorizontal: cellBorder, insideVertical: cellBorder }

  const makeCell = (text: string, isBold = false, isHeader = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold: isBold, size: SZ })] })],
      shading: isHeader ? { fill: 'EDE4D4' } : undefined,
    })

  const depositsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allBorders,
    rows: [
      new TableRow({ children: [makeCell('Description', true, true), makeCell('New Tenancy (RM)', true, true), makeCell('Previous Tenancy (RM)', true, true), makeCell('Top-Up (RM)', true, true)] }),
      new TableRow({ children: [makeCell('Security Deposit'), makeCell(fmtRMLetter(newSec)), makeCell(fmtRMLetter(prevSec)), makeCell(fmtRMLetter(secTop))] }),
      new TableRow({ children: [makeCell('Utilities Deposit'), makeCell(fmtRMLetter(newUtil)), makeCell(fmtRMLetter(prevUtil)), makeCell(fmtRMLetter(utilTop))] }),
      new TableRow({ children: [makeCell('Total', true), makeCell(fmtRMLetter(newSec + newUtil), true), makeCell(fmtRMLetter(prevSec + prevUtil), true), makeCell(fmtRMLetter(secTop + utilTop), true)] }),
    ],
  })

  const bp = (children: InstanceType<typeof TextRun>[]) =>
    new Paragraph({ children: [new TextRun({ text: '- ', size: SZ }), ...children], spacing: { after: 120 } })

  const clause4Text = useTopup
    ? 'The Tenant is required to pay the following for renewal of the Tenancy Agreement:'
    : 'The Deposits amount remained the same for the renewal of the Tenancy Agreement:'

  const additionalTermsPara = record.additional_terms?.trim()
    ? [bp([new TextRun({ text: record.additional_terms.trim(), size: SZ })])]
    : []

  const sigColWidth = 4500
  const noBorder = { style: BorderStyle.NONE }
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }

  const doc = new Document({
    sections: [{
      children: [
        // Title — centered, bold, underlined
        new Paragraph({
          children: [new TextRun({ text: 'TENANCY RENEWAL AGREEMENT', bold: true, size: 28, underline: { type: UnderlineType.SINGLE } })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        }),
        // Preamble
        new Paragraph({
          children: [
            new TextRun({ text: 'The Tenancy Renewal Agreement ("Agreement") is made by and between the "Landlord", ', size: SZ }),
            new TextRun({ text: `${record.landlord_name ?? '—'} (${landlordIdType}: ${record.landlord_id ?? '—'})`, bold: true, size: SZ }),
            new TextRun({ text: ', and the "Tenant", ', size: SZ }),
            new TextRun({ text: `${record.tenant_name ?? '—'} (${tenantIdType}: ${record.tenant_id ?? '—'})`, bold: true, size: SZ }),
            new TextRun({ text: ' for the premise located at ', size: SZ }),
            new TextRun({ text: `${record.unit_full_address ?? '—'}.`, bold: true, size: SZ }),
          ],
          spacing: { after: 240 },
        }),
        // Bullet clauses
        bp([new TextRun({ text: 'With reference to the Tenancy Agreement dated ', size: SZ }), new TextRun({ text: fmtDateLetter(record.original_ta_date) + '.', bold: true, size: SZ })]),
        bp([new TextRun({ text: 'Please be informed that the Tenancy Agreement is ending on ', size: SZ }), new TextRun({ text: fmtDateLetter(record.tenancy_end_date) + '.', bold: true, size: SZ })]),
        bp([new TextRun({ text: `Both the Landlord and the Tenant have confirmed the renewal of the Tenancy Agreement for a further term of ${renewalLen} at a monthly rental of `, size: SZ }), new TextRun({ text: `RM ${fmtRMLetter(record.monthly_rental)}.`, bold: true, size: SZ })]),
        bp([new TextRun({ text: clause4Text, size: SZ })]),
        depositsTable,
        new Paragraph({ text: '', spacing: { after: 120 } }),
        bp([
          new TextRun({ text: 'The said extension shall effect from ', size: SZ }),
          new TextRun({ text: fmtDateLetter(record.renewal_start_date), bold: true, size: SZ }),
          new TextRun({ text: ' till ', size: SZ }),
          new TextRun({ text: fmtDateLetter(record.renewal_end_date), bold: true, size: SZ }),
          new TextRun({ text: ' and is subject to the terms and conditions as contained in the Tenancy Agreement dated ', size: SZ }),
          new TextRun({ text: fmtDateLetter(record.original_ta_date) + '.', bold: true, size: SZ }),
        ]),
        bp([new TextRun({ text: 'In the event of any inconsistency between the terms of this Letter and the Tenancy Agreement, the terms of this Letter shall prevail.', size: SZ })]),
        ...additionalTermsPara,
        new Paragraph({ text: '', spacing: { after: 240 } }),
        new Paragraph({
          children: [new TextRun({ text: 'In witness whereof the parties hereby agreed on the above mentioned terms and conditions:', size: SZ })],
          spacing: { after: 360 },
        }),
        // Signature table (no borders)
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorders,
          rows: [
            new TableRow({ children: [
              new TableCell({ width: { size: sigColWidth, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "TENANT'S ACCEPTANCE", bold: true, size: SZ })] })] }),
              new TableCell({ width: { size: sigColWidth, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "LANDLORD'S ACCEPTANCE", bold: true, size: SZ })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '_____________________________', size: SZ })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '_____________________________', size: SZ })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Signature', size: SZ, color: '78716C' })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Signature', size: SZ, color: '78716C' })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Name: ${record.tenant_name ?? '—'}`, bold: true, size: SZ })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Name: ${record.landlord_name ?? '—'}`, bold: true, size: SZ })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${tenantIdType}: ${record.tenant_id ?? '—'}`, bold: true, size: SZ })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${landlordIdType}: ${record.landlord_id ?? '—'}`, bold: true, size: SZ })] })] }),
            ]}),
          ],
        }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `renewal-letter-${record.unit?.unit_number ?? 'unit'}.docx`; a.click()
  URL.revokeObjectURL(url)
}

// ── Vacating procedures ───────────────────────────────────────────────────────

function buildVacatingProceduresUrl(unitNumber: string, tenantName: string, lister?: string | null): string {
  const msg = [
    `*Move-Out Procedures — ${unitNumber}*`,
    '',
    `Hi ${tenantName}, thank you for informing us of your intention to move-out.`,
    '',
    `Please find below the procedures to ensure a smooth handover. 😊`,
    '',
    `*1️⃣ Confirm Move-out date*`,
    `Kindly confirmed tenant's move-out date. (Must be on or before your Tenancy Expiry Date).`,
    '',
    `*2️⃣ Condition of Unit*`,
    `The unit must be returned in its original condition (fair wear & tear excepted), including:`,
    `- Thorough cleaning of the entire unit (including steam clean of all curtains)`,
    `- All air-conditioning units to be serviced`,
    `- All paintwork touched up`,
    `- All electrical items in good working order`,
    `- Plumbing in good working condition`,
    `- All cabinet hinges are in good working condition`,
    '',
    `A copy of the invoice for all services carried out must be provided as supporting proof upon check-out.`,
    '',
    `*3️⃣ Items to Return*`,
    `Kindly ensure all of the following are returned on the move-out date:`,
    `- All unit keys`,
    `- Access card(s)`,
    `- Car park RFID sticker / access card (if applicable)`,
    `- Any other items provided at the commencement of tenancy`,
    '',
    `*4️⃣ Outstanding Bills*`,
    `Please ensure all utility bills (water, electricity, indah water, gas) are fully settled till the latest month prior to handover.`,
    '',
    `*5️⃣ Handover Appointment*`,
    `Kindly arrange a handover appointment with us at least *3 days before* your move-out date.`,
    '',
    `Should you have any questions, please don't hesitate to reach out.`,
    '',
    `Thank you! 🙏`,
    lister ?? '',
  ].join('\n')
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [record, setRecord] = useState<PropertyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<ServiceProvider[]>([])
  const [descriptions, setDescriptions] = useState<ServiceDescription[]>([])
  const [showAddService, setShowAddService] = useState(false)
  const [savedToast, setSavedToast] = useState(false)
  const [letterTopup, setLetterTopup] = useState(false)
  const [showEditRecord, setShowEditRecord] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [showReport, setShowReport] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, p, d] = await Promise.all([
        getRecord(id),
        getServiceProviders(),
        getServiceDescriptions(),
      ])
      setRecord(r)
      setProviders(p)
      setDescriptions(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (record?.type === 'renewal') setLetterTopup(record.deposit_topup ?? false) }, [record?.deposit_topup, record?.type])

  async function handleDeleteRecord() {
    if (!confirm('Delete this record and all its services?')) return
    try {
      await deleteRecord(id)
      router.push(record?.unit_id ? `/units/${record.unit_id}` : '/')
    } catch (e) {
      console.error(e)
    }
  }

  async function handlePaymentStatus(service: Service, status: Service['payment_status']) {
    try {
      await updateService(service.id, { payment_status: status })
      load()
    } catch (e) {
      console.error(e)
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!confirm('Remove this service?')) return
    try {
      await deleteService(serviceId)
      load()
    } catch (e) {
      console.error(e)
    }
  }

  function getReport(): string {
    if (!record) return ''
    if (record.type === 'checkin') return generateMoveInReport(record)
    if (record.type === 'checkout') return generateMoveOutReport(record)
    return generateMaintenanceReport(record)
  }

  async function copyReport() {
    await navigator.clipboard.writeText(getReport()).catch(console.error)
    if (record && record.unit_id) {
      await markReportGenerated(record.id, record.type, record.unit_id).catch(console.error)
      load()
    }
  }

  async function shareReport() {
    const text = encodeURIComponent(getReport())
    window.open(`https://wa.me/?text=${text}`, '_blank')
    if (record && record.unit_id) {
      await markReportGenerated(record.id, record.type, record.unit_id).catch(console.error)
      load()
    }
  }


  if (loading) {
    return (
      <div className="px-4 py-5 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-[#1e1a14] rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!record) {
    return <EmptyState title="Record not found" action={<Button onClick={() => router.push('/')}>Go back</Button>} />
  }

  const services = record.services ?? []
  const totalServices = services.reduce((s, sv) => s + (sv.amount ?? 0), 0)
  const totalDeductFromDeposit = services
    .filter((s) => s.payment_by === 'Deduct from Deposit')
    .reduce((s, sv) => s + (sv.amount ?? 0), 0)
  const refund = record.type === 'checkout' ? calcRefund(record) : null
  const typeBadge = statusBadge(record.type)
  const hasInvoices = services.some((s) => s.invoice_url || s.invoice_url_2 || s.invoice_url_3)

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Saved toast */}
      {savedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/90 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-lg">
          Saved!
        </div>
      )}
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/units/${record.unit_id}`)}
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
          ← {record.unit?.unit_number ?? 'Back'}
        </button>
        <div className="flex items-center gap-2">
          {hasInvoices && (
            <a
              href={`/api/invoice-bundle?recordId=${record.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ minHeight: '48px', minWidth: '48px' }}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-transparent hover:bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8] transition-all duration-150 touch-manipulation"
            >
              <Paperclip size={14} />
              Invoices
            </a>
          )}
          {record.type === 'renewal' && (
            <>
              <button
                onClick={() => downloadRenewalPdf(record, letterTopup)}
                style={{ minHeight: '48px' }}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-transparent hover:bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8] transition-all"
              >
                📄 PDF
              </button>
              <button
                onClick={() => downloadRenewalWord(record, letterTopup)}
                style={{ minHeight: '48px' }}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-transparent hover:bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8] transition-all"
              >
                📝 Word
              </button>
            </>
          )}
          {record.type !== 'renewal' && (
            <Button variant="ghost" size="sm" icon={<Share2 size={14} />} onClick={() => setShowReport(true)}>
              Report
            </Button>
          )}
          {record.type === 'checkout' && (
            <a
              href={buildVacatingProceduresUrl(record.unit?.unit_number ?? '', record.tenant_name ?? '', record.unit?.lister)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ minHeight: '48px', minWidth: '48px' }}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-transparent hover:bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8] transition-all duration-150 touch-manipulation"
            >
              📤 Vacating
            </a>
          )}
          <Button variant="ghost" size="sm" icon={<Edit2 size={14} />} onClick={() => setShowEditRecord(true)} />
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={handleDeleteRecord}
            className="text-red-400 hover:text-red-300" />
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
          {record.status === 'completed' && (
            <Badge variant="gray">Completed</Badge>
          )}
          {record.is_report_generated && (
            <Badge variant="green">Report Sent</Badge>
          )}
        </div>
        <h1 className="text-xl font-bold text-[#f5f0e8]">
          {record.tenant_name ?? 'No tenant'}
        </h1>
        <p className="text-sm text-[#7c6f54] mt-0.5">
          {record.unit?.unit_number} · {record.unit?.building} · {formatDate(record.date)}
        </p>
        {record.co_agent_checkin && (
          <p className="text-xs text-[#5c5040] mt-0.5">CoA: {record.co_agent_checkin}</p>
        )}
        {(record.created_by || record.updated_by) && (
          <p style={{ fontSize: '11px' }} className="text-[#4a4030] mt-1">
            {record.created_by && `Created by ${record.created_by}`}
            {record.updated_by && record.updated_by !== record.created_by && ` · Last updated by ${record.updated_by}`}
            {record.updated_at && ` on ${new Date(record.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        )}
      </div>

      {/* Financials card (non-renewal only) */}
      {record.type !== 'renewal' && (record.monthly_rental || record.security_deposit || record.utility_deposit) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Financials</p>
          {record.monthly_rental && (
            <CardRow label="Monthly Rental" value={formatCurrency(record.monthly_rental)} />
          )}
          {record.security_deposit && (
            <CardRow label="Security Deposit" value={formatCurrency(record.security_deposit)} />
          )}
          {record.utility_deposit && (
            <CardRow label="Utility Deposit" value={formatCurrency(record.utility_deposit)} />
          )}
          {record.security_deposit && record.utility_deposit && (
            <CardRow
              label="Total Deposits"
              value={
                <span className="text-gold-400 font-semibold">
                  {formatCurrency((record.security_deposit ?? 0) + (record.utility_deposit ?? 0))}
                </span>
              }
              className="border-t border-[#332c20] mt-1 pt-2"
            />
          )}
        </Card>
      )}

      {/* Renewal details */}
      {record.type === 'renewal' && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Renewal Details</p>
          {record.landlord_name && <CardRow label="Landlord" value={record.landlord_name} />}
          {record.landlord_id && <CardRow label={`Landlord ${detectIdType(record.landlord_id)}`} value={record.landlord_id} />}
          {record.tenant_id && <CardRow label={`Tenant ${detectIdType(record.tenant_id)}`} value={record.tenant_id} />}
          {record.unit_full_address && <CardRow label="Full Address" value={record.unit_full_address} />}
          {record.original_ta_date && <CardRow label="Original TA Date" value={formatDate(record.original_ta_date)} />}
          {record.tenancy_end_date && <CardRow label="Previous Expiry" value={formatDate(record.tenancy_end_date)} />}
          {record.renewal_start_date && (
            <CardRow label="Renewal Period" value={`${formatDate(record.renewal_start_date)} – ${formatDate(record.renewal_end_date)} (${computeRenewalLength(record.renewal_start_date, record.renewal_end_date, record.renewal_length_custom)})`} />
          )}
        </Card>
      )}

      {/* Renewal deposit summary */}
      {record.type === 'renewal' && (record.prev_security_deposit != null || record.new_security_deposit != null) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Deposit Renewal</p>
          <CardRow label="New Monthly Rental" value={formatCurrency(record.monthly_rental)} />
          <CardRow label="Prev Security Deposit" value={formatCurrency(record.prev_security_deposit)} />
          <CardRow label="New Security Deposit" value={formatCurrency(record.new_security_deposit)} />
          {(record.security_topup ?? 0) > 0 && <CardRow label="Security Top-up" value={<span className="text-gold-400 font-semibold">{formatCurrency(record.security_topup)}</span>} />}
          <CardRow label="Prev Utility Deposit" value={formatCurrency(record.prev_utility_deposit)} />
          <CardRow label="New Utility Deposit" value={formatCurrency(record.new_utility_deposit)} />
          {(record.utility_topup ?? 0) > 0 && <CardRow label="Utility Top-up" value={<span className="text-gold-400 font-semibold">{formatCurrency(record.utility_topup)}</span>} />}
          {((record.security_topup ?? 0) + (record.utility_topup ?? 0)) > 0 && (
            <CardRow label="Total Top-up" value={<span className="text-gold-300 font-bold">{formatCurrency((record.security_topup ?? 0) + (record.utility_topup ?? 0))}</span>} className="border-t border-[#332c20] mt-1 pt-2" />
          )}
        </Card>
      )}

      {/* Letter template selector (renewal only) */}
      {record.type === 'renewal' && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Letter Template</p>
          <div className="flex gap-2">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setLetterTopup(v)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  letterTopup === v
                    ? 'bg-gold-500/20 border-gold-500/50 text-gold-300'
                    : 'bg-[#262018] border-[#332c20] text-[#7c6f54]'
                }`}
              >
                {v ? 'With Deposit Top-Up' : 'No Deposit Top-Up'}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Tenancy dates */}
      {(record.move_in_date || record.tenancy_start_date) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Tenancy Details</p>
          {record.move_in_date && (
            <CardRow label="Move-in Date" value={formatDate(record.move_in_date)} />
          )}
          {record.tenancy_start_date && (
            <CardRow
              label="Tenancy Period"
              value={`${formatDate(record.tenancy_start_date)} – ${formatDate(record.tenancy_end_date)}`}
            />
          )}
        </Card>
      )}

      {/* Utility statuses (checkout) */}
      {record.type === 'checkout' && (record.electricity_status || record.water_status || record.indah_water_status || record.gas_status) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Utility Status</p>
          {record.electricity_status && (
            <CardRow label="Electricity" value={
              <span className={record.electricity_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.electricity_status}
              </span>
            } />
          )}
          {record.water_status && (
            <CardRow label="Water" value={
              <span className={record.water_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.water_status}
              </span>
            } />
          )}
          {record.indah_water_status && (
            <CardRow label="Indah Water" value={
              <span className={record.indah_water_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.indah_water_status}
              </span>
            } />
          )}
          {record.gas_status && (
            <CardRow label="Gas" value={
              <span className={record.gas_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.gas_status}
              </span>
            } />
          )}
        </Card>
      )}

      {/* Checkout refund summary */}
      {record.type === 'checkout' && refund !== null && (
        <Card className={refund >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">
            Deposit Refund Calculation
          </p>
          <CardRow
            label="Total Deposits"
            value={formatCurrency((record.security_deposit ?? 0) + (record.utility_deposit ?? 0))}
          />
          <CardRow label="Total Deductions" value={formatCurrency(totalDeductFromDeposit)} />
          <CardRow
            label="Balance to Refund"
            value={
              <span className={`font-bold text-base ${refund >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(refund)}
              </span>
            }
            className="border-t border-[#332c20] mt-1 pt-2"
          />
        </Card>
      )}

      {/* Tenant bank details (checkout) */}
      {record.type === 'checkout' && (record.tenant_bank_holder || record.tenant_bank_name) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Refund Bank Details</p>
          {record.tenant_bank_holder && (
            <CardRow label="Account Holder" value={record.tenant_bank_holder} />
          )}
          {record.tenant_bank_name && (
            <CardRow label="Bank" value={`${record.tenant_bank_name}${record.tenant_bank_account ? ` · ${record.tenant_bank_account}` : ''}`} />
          )}
        </Card>
      )}

      {/* Notes */}
      <NotesSection record={record} />

      {/* Services Status (checkout only) */}
      {record.type === 'checkout' && (
        <ServicesStatusSection
          record={record}
          onSaved={(field, value) => setRecord((prev) => prev ? { ...prev, [field]: value } : prev)}
        />
      )}

      {/* Tasks (non-renewal only) */}
      {record.type !== 'renewal' && <TaskSection record={record} />}

      {/* Services (non-renewal only) */}
      {record.type !== 'renewal' && <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">
            Services ({services.length})
            {totalServices > 0 && (
              <span className="ml-2 text-gold-400 normal-case font-normal">
                {formatCurrency(totalServices)} total
              </span>
            )}
          </p>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowAddService(true)}>
            Add
          </Button>
        </div>

        {services.length === 0 ? (
          <EmptyState
            title="No services yet"
            description="Add services, repairs, or charges for this record."
            action={
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddService(true)}>
                Add Service
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={() => setEditingService(service)}
                onDelete={() => handleDeleteService(service.id)}
                onStatusChange={(s) => handlePaymentStatus(service, s)}
              />
            ))}
          </div>
        )}
      </div>}

      {/* Modals */}
      <ServiceModal
        open={showAddService}
        onClose={() => setShowAddService(false)}
        recordId={id}
        recordType={record.type}
        providers={providers}
        descriptions={descriptions}
        onSaved={() => { setShowAddService(false); load() }}
      />

      {editingService && (
        <ServiceModal
          open={!!editingService}
          onClose={() => setEditingService(null)}
          recordId={id}
          recordType={record.type}
          providers={providers}
          descriptions={descriptions}
          editService={editingService}
          onSaved={() => { setEditingService(null); load() }}
        />
      )}

      <EditRecordModal
        record={record}
        open={showEditRecord}
        onClose={() => setShowEditRecord(false)}
        onSaved={() => {
          setShowEditRecord(false)
          if (record.type === 'renewal') {
            setSavedToast(true)
            setTimeout(() => router.push(`/units/${record.unit_id}`), 1000)
          } else {
            load()
          }
        }}
      />

      {/* Report modal */}
      <Modal open={showReport} onClose={() => setShowReport(false)} title="WhatsApp Report">
        <div className="space-y-4">
          <pre className="whitespace-pre-wrap text-sm text-[#a89d84] bg-[#262018] border border-[#332c20] rounded-xl p-4 font-sans leading-relaxed max-h-72 overflow-y-auto">
            {getReport()}
          </pre>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={copyReport}>
              Copy Text
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={shareReport}
              icon={<Share2 size={14} />}
            >
              Send via WhatsApp
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Service Card ──────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  service: Service
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (s: Service['payment_status']) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const paymentColors: { [K in Service['payment_status']]: string } = {
    unpaid: 'text-red-400 border-red-500/30 bg-red-500/10',
    proof_sent: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
    paid: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  }

  return (
    <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] overflow-hidden">
      {/* Main row */}
      <div className="flex items-center px-4 py-3 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#f5f0e8] truncate">{service.description}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {service.provider && (
              <p className="text-xs text-[#7c6f54] truncate">{service.provider.name}</p>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PAYMENT_BY_COLORS[service.payment_by]}`}>
              {service.payment_by}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-gold-400">{formatCurrency(service.amount)}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 p-1 text-[#5c5040] hover:text-[#a89d84]"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Payment status bar */}
      <div className="flex border-t border-[#332c20]">
        {(['unpaid', 'proof_sent', 'paid'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${
              service.payment_status === s
                ? paymentColors[s]
                : 'text-[#5c5040] hover:text-[#7c6f54]'
            }`}
          >
            {s === 'unpaid' && <X size={10} className="inline mr-1" />}
            {s === 'proof_sent' && <Clock size={10} className="inline mr-1" />}
            {s === 'paid' && <Check size={10} className="inline mr-1" />}
            {PAYMENT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#332c20] px-4 py-3 space-y-2">
          {service.provider && (
            <div>
              <p className="text-[10px] text-[#5c5040] uppercase tracking-wide">Bank Details</p>
              <p className="text-xs text-[#a89d84] mt-0.5">
                {service.provider.bank_name} · {service.provider.bank_account}
              </p>
            </div>
          )}
          {[service.invoice_url, service.invoice_url_2, service.invoice_url_3]
            .filter(Boolean)
            .map((url, i, arr) => (
              <a
                key={i}
                href={url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300"
              >
                <Upload size={12} /> View Invoice{arr.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))
          }
          {service.notes && (
            <p className="text-xs text-[#7c6f54]">{service.notes}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm" icon={<Edit2 size={12} />} onClick={onEdit}>
              Edit
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={onDelete}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Service Modal ─────────────────────────────────────────────────────────────

type InvoiceItem = { kind: 'existing'; url: string } | { kind: 'new'; file: File }

function invoiceDisplayName(item: InvoiceItem): string {
  if (item.kind === 'new') return item.file.name
  const raw = item.url.split('/').pop()?.split('?')[0] ?? 'invoice'
  // Strip UUID prefix like "96d76868-735e-4400-8e58-8d5b6be4e5da_"
  const clean = raw.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_?/i, '') || raw
  return clean.length > 30 ? clean.slice(0, 27) + '…' : clean
}

function ServiceModal({
  open,
  onClose,
  recordId,
  recordType,
  providers,
  descriptions,
  editService,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  recordId: string
  recordType: RecordType
  providers: ServiceProvider[]
  descriptions: ServiceDescription[]
  editService?: Service
  onSaved: () => void
}) {
  const paymentByOptions = recordType === 'checkout' ? PAYMENT_BY_CHECKOUT : PAYMENT_BY_OTHER
  const defaultPaymentBy: PaymentBy = recordType === 'checkout' ? 'Deduct from Deposit' : 'Pay by Owner'

  const [description, setDescription] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [providerId, setProviderId] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualBankName, setManualBankName] = useState('')
  const [manualBankAccount, setManualBankAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentBy, setPaymentBy] = useState<PaymentBy>(defaultPaymentBy)
  const [notes, setNotes] = useState('')
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset or pre-fill whenever modal opens
  useEffect(() => {
    if (!open) return
    setError('')
    if (editService) {
      setDescription(editService.description)
      setCustomDescription('')
      setProviderId(editService.provider_id ?? '')
      setManualMode(false)
      setManualName('')
      setManualBankName('')
      setManualBankAccount('')
      setAmount(String(editService.amount))
      setPaymentBy(editService.payment_by)
      setNotes(editService.notes ?? '')
      const existing: InvoiceItem[] = []
      if (editService.invoice_url) existing.push({ kind: 'existing', url: editService.invoice_url })
      if (editService.invoice_url_2) existing.push({ kind: 'existing', url: editService.invoice_url_2 })
      if (editService.invoice_url_3) existing.push({ kind: 'existing', url: editService.invoice_url_3 })
      setInvoices(existing)
    } else {
      setDescription('')
      setCustomDescription('')
      setProviderId('')
      setManualMode(false)
      setManualName('')
      setManualBankName('')
      setManualBankAccount('')
      setAmount('')
      setPaymentBy(defaultPaymentBy)
      setNotes('')
      setInvoices([])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProvider = providers.find((p) => p.id === providerId)
  const isOthers = description === 'Others'

  function handleProviderChange(value: string) {
    if (value === '__manual__') {
      setManualMode(true)
      setProviderId('')
    } else {
      setProviderId(value)
    }
  }

  function addInvoiceFile(file: File) {
    if (invoices.length >= 3) return
    setInvoices((prev) => [...prev, { kind: 'new', file }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const finalDescription = isOthers ? customDescription.trim() : description
    if (!finalDescription) { setError('Please select or enter a description.'); return }
    if (!amount || isNaN(parseFloat(amount))) { setError('Please enter a valid amount.'); return }

    setLoading(true)
    setError('')
    try {
      // Resolve provider
      let resolvedProviderId: string | null = providerId || null
      if (manualMode && manualName.trim()) {
        const created = await createServiceProvider({
          name: manualName.trim(),
          bank_name: manualBankName.trim() || undefined,
          bank_account: manualBankAccount.trim() || undefined,
        })
        resolvedProviderId = created.id
      }

      const serviceData = {
        record_id: recordId,
        description: finalDescription,
        provider_id: resolvedProviderId,
        amount: parseFloat(amount),
        payment_by: paymentBy,
        notes: notes.trim() || null,
        invoice_url: null as string | null,
        invoice_url_2: null as string | null,
        invoice_url_3: null as string | null,
      }

      let savedServiceId = editService?.id

      if (editService) {
        await updateService(editService.id, serviceData)
      } else {
        const created = await createService(serviceData)
        savedServiceId = created.id
      }

      // Upload any new invoices; keep existing URLs in their slots
      if (savedServiceId) {
        const urls: (string | null)[] = [null, null, null]
        for (let i = 0; i < Math.min(invoices.length, 3); i++) {
          const item = invoices[i]
          if (item.kind === 'existing') {
            urls[i] = item.url
          } else {
            urls[i] = await uploadInvoice(item.file, savedServiceId, (i + 1) as 1 | 2 | 3)
          }
        }
        await updateService(savedServiceId, {
          invoice_url: urls[0],
          invoice_url_2: urls[1],
          invoice_url_3: urls[2],
        })
      }

      onSaved()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editService ? 'Edit Service' : 'Add Service'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Service Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Select description…"
          options={descriptions.map((d) => ({ value: d.description, label: d.description }))}
        />
        {isOthers && (
          <Input
            label="Custom Description"
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            placeholder="Describe the service…"
          />
        )}

        {/* Provider — dropdown or manual input */}
        {!manualMode ? (
          <Select
            label="Service Provider"
            value={providerId}
            onChange={(e) => handleProviderChange(e.target.value)}
            placeholder="Select provider (optional)…"
            options={[
              ...providers.map((p) => ({ value: p.id, label: p.name })),
              { value: '__manual__', label: 'Type manually...' },
            ]}
          />
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-xs text-[#7c6f54] hover:text-[#a89d84] transition-colors"
            >
              ← Back to list
            </button>
            <Input
              label="Provider Name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Sia Geok Ling"
            />
            <Input
              label="Bank Name"
              value={manualBankName}
              onChange={(e) => setManualBankName(e.target.value)}
              placeholder="e.g. Maybank"
            />
            <Input
              label="Account Number"
              value={manualBankAccount}
              onChange={(e) => setManualBankAccount(e.target.value)}
              placeholder="e.g. 1234 5678"
            />
          </div>
        )}

        {!manualMode && selectedProvider && (
          <div className="rounded-xl bg-[#262018] border border-[#332c20] px-3 py-2.5">
            <p className="text-[10px] text-[#5c5040] uppercase tracking-wide mb-1">Bank Details</p>
            <p className="text-xs text-[#a89d84]">
              {selectedProvider.bank_name} · {selectedProvider.bank_account}
            </p>
          </div>
        )}

        <Input
          label="Amount (RM)"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          prefix="RM"
        />
        <Select
          label="Payment by"
          value={paymentBy}
          onChange={(e) => setPaymentBy(e.target.value as PaymentBy)}
          options={paymentByOptions.map((v) => ({ value: v, label: v }))}
        />
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes…"
        />

        {/* Invoice upload — up to 3 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#a89d84]">
            Invoices (optional)
          </label>
          {invoices.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#262018] border border-[#332c20]">
              <Upload size={12} className="text-[#7c6f54] shrink-0" />
              <span className="text-xs text-[#a89d84] flex-1 truncate">{invoiceDisplayName(item)}</span>
              <button
                type="button"
                onClick={() => setInvoices((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-red-400 hover:text-red-300 transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {invoices.length < 3 && (
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[#332c20] bg-[#262018] cursor-pointer hover:border-gold-500/40 transition-colors">
              <Upload size={14} className="text-[#7c6f54]" />
              <span className="text-xs text-[#7c6f54]">
                {invoices.length === 0 ? 'Upload invoice…' : `Upload invoice (${invoices.length}/3 uploaded)`}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) addInvoiceFile(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
          {invoices.length === 3 && (
            <p className="text-[10px] text-[#5c5040]">Maximum 3 invoices reached.</p>
          )}
        </div>

        {editService?.created_by && (
          <p className="text-[11px] text-[#4a4030]">Added by {editService.created_by}</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="sticky bottom-0 bg-[#1e1a14] -mx-5 px-5 pt-3 pb-5 border-t border-[#332c20] flex gap-3 mt-2">
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>
            {editService ? 'Save Changes' : 'Add Service'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edit Record Modal ─────────────────────────────────────────────────────────

function EditRecordModal({
  record,
  open,
  onClose,
  onSaved,
}: {
  record: PropertyRecord
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [tenantName, setTenantName] = useState(record.tenant_name ?? '')
  const [date, setDate] = useState(record.date)
  const [monthlyRental, setMonthlyRental] = useState(String(record.monthly_rental ?? ''))
  const [securityDeposit, setSecurityDeposit] = useState(String(record.security_deposit ?? ''))
  const [utilityDeposit, setUtilityDeposit] = useState(String(record.utility_deposit ?? ''))
  const [notes, setNotes] = useState(record.notes ?? '')
  const [status, setStatus] = useState(record.status)
  // Tenancy
  const [moveInDate, setMoveInDate] = useState(record.move_in_date ?? '')
  const [tenancyStart, setTenancyStart] = useState(record.tenancy_start_date ?? '')
  const [tenancyEnd, setTenancyEnd] = useState(record.tenancy_end_date ?? '')
  // Checkout utility
  const [electricityStatus, setElectricityStatus] = useState(record.electricity_status ?? '')
  const [waterStatus, setWaterStatus] = useState(record.water_status ?? '')
  const [indahWaterStatus, setIndahWaterStatus] = useState(record.indah_water_status ?? '')
  const [gasStatus, setGasStatus] = useState(record.gas_status ?? '')
  // Checkout bank
  const [bankHolder, setBankHolder] = useState(record.tenant_bank_holder ?? '')
  const [bankName, setBankName] = useState(record.tenant_bank_name ?? '')
  const [bankAccount, setBankAccount] = useState(record.tenant_bank_account ?? '')
  // Renewal fields
  const [landlordName, setLandlordName] = useState(record.landlord_name ?? '')
  const [landlordId, setLandlordId] = useState(record.landlord_id ?? '')
  const [tenantId, setTenantId] = useState(record.tenant_id ?? '')
  const [unitFullAddress, setUnitFullAddress] = useState(record.unit_full_address ?? '')
  const [originalTaDate, setOriginalTaDate] = useState(record.original_ta_date ?? '')
  const [renewalStart, setRenewalStart] = useState(record.renewal_start_date ?? '')
  const [renewalEnd, setRenewalEnd] = useState(record.renewal_end_date ?? '')
  const [prevSecurity, setPrevSecurity] = useState(String(record.prev_security_deposit ?? ''))
  const [prevUtility, setPrevUtility] = useState(String(record.prev_utility_deposit ?? ''))
  const [newSecurity, setNewSecurity] = useState(String(record.new_security_deposit ?? ''))
  const [newUtility, setNewUtility] = useState(String(record.new_utility_deposit ?? ''))
  const [depositTopup, setDepositTopup] = useState(record.deposit_topup ?? false)
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set())
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function autoFillDeposits() {
    const rental = parseFloat(monthlyRental)
    if (!isNaN(rental) && rental > 0) {
      setSecurityDeposit(String(rental * 2))
      setUtilityDeposit(String(rental * 0.5))
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setReading(true)
    setError('')
    try {
      const base64 = await fileToBase64(file)
      const prompt = `Extract the following from this tenancy agreement or renewal letter document:
- Landlord full name
- Landlord ID (NRIC or passport number)
- Tenant full name
- Tenant ID (NRIC or passport number)
- Unit full address
- Original tenancy agreement date
- Tenancy start date
- Tenancy end date / expiry date
- Monthly rental amount (number only)
- Security deposit amount (number only)
- Utility deposit amount (number only)
Return as JSON with these exact keys:
landlord_name, landlord_id, tenant_name, tenant_id, unit_full_address, original_ta_date, renewal_start_date, renewal_end_date, monthly_rental, security_deposit, utility_deposit
Use YYYY-MM-DD format for all dates. Use null for any field not found.`
      const res = await fetch('/api/read-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type || 'image/jpeg', prompt }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const filled = new Set<string>()
      if (data.landlord_name) { setLandlordName(data.landlord_name); filled.add('landlord_name') }
      if (data.landlord_id) { setLandlordId(data.landlord_id); filled.add('landlord_id') }
      if (data.tenant_name) { setTenantName(data.tenant_name); filled.add('tenant_name') }
      if (data.tenant_id) { setTenantId(data.tenant_id); filled.add('tenant_id') }
      if (data.unit_full_address) { setUnitFullAddress(data.unit_full_address); filled.add('unit_full_address') }
      if (data.original_ta_date) { setOriginalTaDate(data.original_ta_date); filled.add('original_ta_date') }
      if (data.renewal_start_date) { setRenewalStart(data.renewal_start_date); filled.add('renewal_start_date') }
      if (data.renewal_end_date) { setRenewalEnd(data.renewal_end_date); filled.add('renewal_end_date') }
      if (data.monthly_rental != null) { setMonthlyRental(String(data.monthly_rental)); filled.add('monthly_rental') }
      if (data.security_deposit != null) { setPrevSecurity(String(data.security_deposit)); filled.add('security_deposit') }
      if (data.utility_deposit != null) { setPrevUtility(String(data.utility_deposit)); filled.add('utility_deposit') }
      setAutoFilledFields(filled)
    } catch (e) {
      setError(`Could not read document: ${e}`)
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const safeNum = (v: string) => v ? Math.round(parseFloat(v) * 100) / 100 || null : null
      const prevSec = parseFloat(prevSecurity) || 0
      const prevUtil = parseFloat(prevUtility) || 0
      const newSec = parseFloat(newSecurity) || 0
      const newUtil = parseFloat(newUtility) || 0
      const renewalFields: Partial<PropertyRecord> = record.type === 'renewal' ? {
        landlord_name: landlordName.trim() || null,
        landlord_id: landlordId.trim() || null,
        tenant_id: tenantId.trim() || null,
        unit_full_address: unitFullAddress.trim() || null,
        original_ta_date: originalTaDate || null,
        renewal_start_date: renewalStart || null,
        renewal_end_date: renewalEnd || null,
        monthly_rental: safeNum(monthlyRental),
        prev_security_deposit: safeNum(prevSecurity),
        prev_utility_deposit: safeNum(prevUtility),
        new_security_deposit: safeNum(newSecurity),
        new_utility_deposit: safeNum(newUtility),
        security_topup: depositTopup ? (newSec - prevSec) : null,
        utility_topup: depositTopup ? (newUtil - prevUtil) : null,
        deposit_topup: depositTopup,
      } : {}
      await updateRecord(record.id, {
        tenant_name: tenantName.trim() || null,
        date,
        monthly_rental: safeNum(monthlyRental),
        security_deposit: safeNum(securityDeposit),
        utility_deposit: safeNum(utilityDeposit),
        notes: notes.trim() || null,
        status,
        move_in_date: moveInDate || null,
        tenancy_start_date: tenancyStart || null,
        tenancy_end_date: tenancyEnd || null,
        electricity_status: (electricityStatus as PropertyRecord['electricity_status']) || null,
        water_status: (waterStatus as PropertyRecord['water_status']) || null,
        indah_water_status: (indahWaterStatus as PropertyRecord['indah_water_status']) || null,
        gas_status: (gasStatus as PropertyRecord['gas_status']) || null,
        tenant_bank_holder: bankHolder.trim() || null,
        tenant_bank_name: bankName.trim() || null,
        tenant_bank_account: bankAccount.trim() || null,
        ...renewalFields,
      })
      onSaved()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Record">
      <form onSubmit={handleSubmit} className="space-y-4">
        {record.type === 'renewal' && (
          <div className="rounded-xl border border-[#332c20] bg-[#141108] p-4 space-y-2">
            <p className="text-[11px] font-semibold text-[#7c6f54] uppercase tracking-wider">Auto-fill from Document</p>
            <div className="flex items-center gap-3 flex-wrap">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleDocUpload} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={reading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#332c20] bg-[#1e1a14] hover:bg-[#262018] text-sm text-[#a89d84] transition-colors disabled:opacity-50"
              >
                <Upload size={14} />
                {reading ? 'Reading…' : 'Upload TA / Renewal Letter'}
              </button>
              {reading && <span className="text-xs text-[#7c6f54]">Claude is reading…</span>}
              {autoFilledFields.size > 0 && !reading && (
                <span className="text-xs text-emerald-400">{autoFilledFields.size} field{autoFilledFields.size !== 1 ? 's' : ''} auto-filled ✓</span>
              )}
            </div>
          </div>
        )}
        <Input
          label="Tenant Name"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          className={autoFilledFields.has('tenant_name') ? 'ring-1 ring-emerald-500/40' : ''}
        />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {record.type === 'checkin' && (
          <Input label="Move-in Date" type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
        )}
        {record.type !== 'maintenance' && record.type !== 'renewal' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tenancy Start" type="date" value={tenancyStart} onChange={(e) => setTenancyStart(e.target.value)} />
            <Input label="Tenancy End" type="date" value={tenancyEnd} onChange={(e) => setTenancyEnd(e.target.value)} />
          </div>
        )}
        {record.type !== 'maintenance' && record.type !== 'renewal' && (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Monthly Rental (RM)"
                  type="number"
                  step="0.01"
                  value={monthlyRental}
                  onChange={(e) => setMonthlyRental(e.target.value)}
                  prefix="RM"
                  className={autoFilledFields.has('monthly_rental') ? 'ring-1 ring-emerald-500/40' : ''}
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={autoFillDeposits}>
                Auto-fill
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Security Deposit"
                type="number"
                step="0.01"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(e.target.value)}
                prefix="RM"
              />
              <Input
                label="Utility Deposit"
                type="number"
                step="0.01"
                value={utilityDeposit}
                onChange={(e) => setUtilityDeposit(e.target.value)}
                prefix="RM"
              />
            </div>
          </>
        )}
        {record.type === 'checkout' && (
          <>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Utility Status</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Electricity" value={electricityStatus} onChange={(e) => setElectricityStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
              <Select label="Water" value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
              <Select label="Indah Water" value={indahWaterStatus} onChange={(e) => setIndahWaterStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
              <Select label="Gas" value={gasStatus} onChange={(e) => setGasStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
            </div>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Refund Bank Details</p>
            <Input label="Account Holder" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <Input label="Account No." value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
          </>
        )}
        {/* Renewal-specific fields */}
        {record.type === 'renewal' && (
          <>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Renewal Info</p>
            <Input
              label="Landlord Name"
              value={landlordName}
              onChange={(e) => setLandlordName(e.target.value)}
              className={autoFilledFields.has('landlord_name') ? 'ring-1 ring-emerald-500/40' : ''}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Landlord ID (NRIC/Passport)"
                value={landlordId}
                onChange={(e) => setLandlordId(e.target.value)}
                className={autoFilledFields.has('landlord_id') ? 'ring-1 ring-emerald-500/40' : ''}
              />
              <Input
                label="Tenant ID (NRIC/Passport)"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className={autoFilledFields.has('tenant_id') ? 'ring-1 ring-emerald-500/40' : ''}
              />
            </div>
            <Input
              label="Unit Full Address"
              value={unitFullAddress}
              onChange={(e) => setUnitFullAddress(e.target.value)}
              className={autoFilledFields.has('unit_full_address') ? 'ring-1 ring-emerald-500/40' : ''}
            />
            <Input
              label="Original TA Date"
              type="date"
              value={originalTaDate}
              onChange={(e) => setOriginalTaDate(e.target.value)}
              className={autoFilledFields.has('original_ta_date') ? 'ring-1 ring-emerald-500/40' : ''}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Renewal Start"
                type="date"
                value={renewalStart}
                onChange={(e) => setRenewalStart(e.target.value)}
                className={autoFilledFields.has('renewal_start_date') ? 'ring-1 ring-emerald-500/40' : ''}
              />
              <Input
                label="Renewal End"
                type="date"
                value={renewalEnd}
                onChange={(e) => setRenewalEnd(e.target.value)}
                className={autoFilledFields.has('renewal_end_date') ? 'ring-1 ring-emerald-500/40' : ''}
              />
            </div>
            {/* New monthly rental */}
            <Input
              label="New Monthly Rental (RM)"
              type="number"
              step="0.01"
              value={monthlyRental}
              onChange={(e) => {
                const v = e.target.value
                setMonthlyRental(v)
                const r = parseFloat(v) || 0
                if (r > 0) {
                  setNewSecurity(String(r * 2))
                  setNewUtility(String(r * 0.5))
                }
              }}
              prefix="RM"
              className={autoFilledFields.has('monthly_rental') ? 'ring-1 ring-emerald-500/40' : ''}
            />
            {/* Deposit top-up toggle */}
            <div>
              <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-2">Deposit Top-up Required?</p>
              <div className="flex gap-2">
                {([false, true] as const).map((v) => (
                  <button key={String(v)} type="button" onClick={() => setDepositTopup(v)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${depositTopup === v ? 'bg-gold-500/20 border-gold-500/50 text-gold-300' : 'bg-[#262018] border-[#332c20] text-[#7c6f54]'}`}>
                    {v ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>
            {/* Previous Tenancy */}
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">Previous Tenancy</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Previous Security Deposit (RM)"
                type="number"
                step="0.01"
                value={prevSecurity}
                onChange={(e) => setPrevSecurity(e.target.value)}
                prefix="RM"
                className={autoFilledFields.has('security_deposit') ? 'ring-1 ring-emerald-500/40' : ''}
              />
              <Input
                label="Previous Utility Deposit (RM)"
                type="number"
                step="0.01"
                value={prevUtility}
                onChange={(e) => setPrevUtility(e.target.value)}
                prefix="RM"
                className={autoFilledFields.has('utility_deposit') ? 'ring-1 ring-emerald-500/40' : ''}
              />
            </div>
            {(prevSecurity || prevUtility) && (
              <div className="flex justify-between text-xs px-1">
                <span className="text-[#7c6f54]">Previous Total</span>
                <span className="text-[#a89d84] font-medium">RM {((parseFloat(prevSecurity) || 0) + (parseFloat(prevUtility) || 0)).toFixed(2)}</span>
              </div>
            )}
            {/* New Tenancy */}
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">New Tenancy</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="New Security Deposit (RM)"
                type="number"
                step="0.01"
                value={newSecurity}
                onChange={(e) => setNewSecurity(e.target.value)}
                prefix="RM"
              />
              <Input
                label="New Utility Deposit (RM)"
                type="number"
                step="0.01"
                value={newUtility}
                onChange={(e) => setNewUtility(e.target.value)}
                prefix="RM"
              />
            </div>
            {(newSecurity || newUtility) && (
              <div className="flex justify-between text-xs px-1">
                <span className="text-[#7c6f54]">New Total</span>
                <span className="text-[#a89d84] font-medium">RM {((parseFloat(newSecurity) || 0) + (parseFloat(newUtility) || 0)).toFixed(2)}</span>
              </div>
            )}
            {/* Top-up */}
            {depositTopup && (
              <div className="rounded-xl bg-[#262018] border border-[#332c20] p-3 space-y-1.5">
                <p className="text-xs text-[#7c6f54] font-medium uppercase tracking-wider">Top-Up</p>
                {(() => {
                  const st = (parseFloat(newSecurity) || 0) - (parseFloat(prevSecurity) || 0)
                  const ut = (parseFloat(newUtility) || 0) - (parseFloat(prevUtility) || 0)
                  return (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#a89d84]">Security Top-up</span>
                        <span className={`font-medium ${st > 0 ? 'text-gold-400' : 'text-[#7c6f54]'}`}>RM {Math.max(0, st).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#a89d84]">Utility Top-up</span>
                        <span className={`font-medium ${ut > 0 ? 'text-gold-400' : 'text-[#7c6f54]'}`}>RM {Math.max(0, ut).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-[#332c20] pt-1.5 mt-1">
                        <span className="text-[#f5f0e8] font-medium">Total Top-up</span>
                        <span className="text-gold-300 font-semibold">RM {(Math.max(0, st) + Math.max(0, ut)).toFixed(2)}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </>
        )}
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PropertyRecord['status'])}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="sticky bottom-0 bg-[#1e1a14] -mx-5 px-5 pt-3 pb-5 border-t border-[#332c20] flex gap-3 mt-2">
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>{record.type === 'renewal' ? 'Save Renewal' : 'Save Changes'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Services Status Section ───────────────────────────────────────────────────

const SERVICE_STATUS_OPTIONS = [
  'TBC',
  'Completed & Paid by Tenant',
  'To be scheduled, Deduct from Deposit',
  'Scheduled by Tenant, Deduct from Deposit',
] as const

const statusSelectCls =
  'w-full rounded-lg bg-[#262018] border border-[#332c20] text-xs text-[#a89d84] px-3 py-2.5 focus:outline-none focus:border-gold-500/60 appearance-none cursor-pointer'

function ServicesStatusSection({ record, onSaved }: { record: PropertyRecord; onSaved: (field: string, value: string) => void }) {
  const [cleaning, setCleaning] = useState(record.cleaning_status ?? 'TBC')
  const [steam, setSteam]       = useState(record.steam_cleaning_status ?? 'TBC')
  const [aircond, setAircond]   = useState(record.aircond_status ?? 'TBC')
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function save(field: string, value: string, setter: (v: string) => void) {
    setError(null)
    const { error: err } = await supabase
      .from('records')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', record.id)
    if (err) {
      setError('Failed to save — ' + err.message)
      return
    }
    setter(value)
    onSaved(field, value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">Services Status</p>
        <span className={`text-xs text-emerald-400 transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}>
          Saved ✓
        </span>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <Card>
        <div className="space-y-4">
          {[
            { label: 'Cleaning Service',     value: cleaning, setter: setCleaning, field: 'cleaning_status' },
            { label: 'Steam Cleaning',        value: steam,    setter: setSteam,    field: 'steam_cleaning_status' },
            { label: 'Air Cond Service',      value: aircond,  setter: setAircond,  field: 'aircond_status' },
          ].map(({ label, value, setter, field }) => (
            <div key={field}>
              <p className="text-xs text-[#7c6f54] mb-1.5">{label}</p>
              <div className="relative">
                <select
                  value={value}
                  onChange={(e) => save(field, e.target.value, setter)}
                  className={statusSelectCls}
                >
                  {SERVICE_STATUS_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5c5040] text-xs">▾</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Notes Section ─────────────────────────────────────────────────────────────

function fmtDateTime(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function NotesSection({ record }: { record: PropertyRecord }) {
  const [value, setValue] = useState(record.notes ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow: recalculate height whenever value changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(100, el.scrollHeight) + 'px'
  }, [value])

  // Clear pending timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setValue(text)
    setSaveState('idle')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await updateRecord(record.id, { notes: text.trim() || null })
        setLastSavedAt(new Date())
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 2000)
      } catch (err) {
        console.error('[NotesSection] save error:', err)
        setSaveState('idle')
      }
    }, 1000)
  }

  const displayTimestamp = lastSavedAt
    ? fmtDateTime(lastSavedAt)
    : record.updated_at ? fmtDateTime(new Date(record.updated_at)) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">Notes</p>
        <span className={`text-xs transition-opacity duration-500 ${
          saveState === 'saving' ? 'opacity-100 text-[#5c5040]'
          : saveState === 'saved' ? 'opacity-100 text-emerald-400'
          : 'opacity-0'
        }`}>
          {saveState === 'saving' ? 'Saving…' : 'Saved ✓'}
        </span>
      </div>
      <div className="rounded-xl border border-[#332c20] bg-[#1e1a14] overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder="Add notes about this unit, progress updates, or important information..."
          className="w-full px-4 py-3 text-sm text-[#f5f0e8] placeholder-[#4a4030] bg-transparent resize-none outline-none leading-relaxed"
          style={{ minHeight: '100px' }}
        />
      </div>
      {displayTimestamp && (
        <p className="text-[10px] text-[#5c5040]">Last updated: {displayTimestamp}</p>
      )}
    </div>
  )
}
