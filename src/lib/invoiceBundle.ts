import jsPDF from 'jspdf'
import type { PropertyRecord } from './types'
import { formatCurrency, formatDate } from './utils'

const RECORD_TYPE_LABELS: Record<string, string> = {
  checkin: 'Check-in',
  checkout: 'Check-out',
  maintenance: 'Maintenance',
}

async function fetchAsBase64(url: string): Promise<{ data: string; format: 'JPEG' | 'PNG' | 'PDF' } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()

    if (blob.type === 'application/pdf') return { data: '', format: 'PDF' }
    if (!blob.type.startsWith('image/')) return null

    const format: 'JPEG' | 'PNG' = blob.type === 'image/png' ? 'PNG' : 'JPEG'
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ data: reader.result as string, format })
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 800, h: 600 })
    img.src = src
  })
}

export async function downloadInvoiceBundle(record: PropertyRecord): Promise<void> {
  const unit = record.unit
  const services = record.services ?? []

  const PAGE_W = 210
  const PAGE_H = 297
  const M = 18
  const CW = PAGE_W - M * 2

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Cover page ──────────────────────────────────────────────────────────────

  let y = M

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 25, 15)
  doc.text('One Oak Property Management', M, y)

  y += 8
  doc.setFontSize(13)
  doc.setTextColor(120, 100, 65)
  doc.text('Invoice Bundle', M, y)

  y += 5
  doc.setDrawColor(180, 155, 100)
  doc.setLineWidth(0.5)
  doc.line(M, y, PAGE_W - M, y)

  y += 10
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(35, 30, 20)
  doc.text(`Unit: ${unit?.unit_number ?? ''} | ${unit?.building ?? ''}`, M, y)
  y += 7
  doc.text(`Tenant: ${record.tenant_name ?? '—'}`, M, y)
  y += 7
  doc.text(`Record Type: ${RECORD_TYPE_LABELS[record.type] ?? record.type}`, M, y)
  y += 7
  doc.text(`Date: ${formatDate(record.date)}`, M, y)

  // Services table
  y += 14
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 25, 15)
  doc.text('Services', M, y)

  y += 7
  // Header row
  doc.setFillColor(235, 225, 200)
  doc.rect(M, y - 5, CW, 7, 'F')
  doc.setFontSize(9)
  doc.setTextColor(75, 60, 35)
  doc.text('#', M + 1, y)
  doc.text('Description', M + 9, y)
  doc.text('Provider', M + 100, y)
  doc.text('Amount', PAGE_W - M - 1, y, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(35, 30, 20)

  services.forEach((s, i) => {
    y += 7
    if (i % 2 === 0) {
      doc.setFillColor(248, 245, 238)
      doc.rect(M, y - 5, CW, 7, 'F')
    }
    doc.setFontSize(9)
    doc.text(String(i + 1), M + 1, y)
    const desc = s.description.length > 42 ? s.description.slice(0, 42) + '…' : s.description
    doc.text(desc, M + 9, y)
    const prov = (s.provider?.name ?? '—').length > 20
      ? (s.provider?.name ?? '—').slice(0, 20) + '…'
      : (s.provider?.name ?? '—')
    doc.text(prov, M + 100, y)
    doc.text(formatCurrency(s.amount), PAGE_W - M - 1, y, { align: 'right' })
  })

  // Total row
  y += 9
  doc.setDrawColor(180, 155, 100)
  doc.setLineWidth(0.4)
  doc.line(M, y - 4, PAGE_W - M, y - 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const total = services.reduce((sum, s) => sum + (s.amount ?? 0), 0)
  doc.text('Total', M + 9, y)
  doc.text(formatCurrency(total), PAGE_W - M - 1, y, { align: 'right' })

  // ── Invoice pages ───────────────────────────────────────────────────────────

  const servicesWithInvoice = services.filter((s) => s.invoice_url)

  for (const service of servicesWithInvoice) {
    doc.addPage()
    y = M

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 25, 15)
    const header = `Invoice: ${service.description}`
    doc.text(header.length > 62 ? header.slice(0, 62) + '…' : header, M, y)

    if (service.provider) {
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 85, 55)
      doc.text(`${service.provider.name}  ·  ${formatCurrency(service.amount)}`, M, y)
    } else {
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 85, 55)
      doc.text(formatCurrency(service.amount), M, y)
    }

    y += 5
    doc.setDrawColor(180, 155, 100)
    doc.setLineWidth(0.3)
    doc.line(M, y, PAGE_W - M, y)
    y += 9

    const result = await fetchAsBase64(service.invoice_url!)

    if (!result) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(150, 100, 80)
      doc.text('Could not load invoice file.', M, y)
    } else if (result.format === 'PDF') {
      const filename = decodeURIComponent(service.invoice_url!.split('/').pop() ?? 'invoice.pdf')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(35, 30, 20)
      doc.text(`PDF file: ${filename}`, M, y)
      y += 8
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(100, 85, 55)
      doc.text('PDF invoices cannot be embedded. Open the original link to view.', M, y)
    } else {
      try {
        const dims = await getImageDimensions(result.data)
        const availW = CW
        const availH = PAGE_H - y - M
        const aspectRatio = dims.w / dims.h

        let drawW = availW
        let drawH = drawW / aspectRatio
        if (drawH > availH) {
          drawH = availH
          drawW = drawH * aspectRatio
        }

        const imgX = M + (CW - drawW) / 2
        doc.addImage(result.data, result.format, imgX, y, drawW, drawH)
      } catch {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(150, 100, 80)
        doc.text('Could not render invoice image.', M, y)
      }
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const unitStr = (unit?.unit_number ?? 'unit').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  const dateStr = record.date.split('T')[0]
  doc.save(`${unitStr}-${record.type}-${dateStr}-invoices.pdf`)
}
