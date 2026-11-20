// Pro-rate electricity calculation as a one-page A4 PDF (pdf-lib, client-side, free).
// All figures come from utilityCalc's ElecProRate (see ElecProRateDetails); nothing is recalculated here.

import { parseLocalDate } from './utilityCalc'
import type { ElecProRateDetails } from './utilityDocs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "14-Nov-2026" */
export function dMonY(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

/** "14 November 2026" */
function dMonthY(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

function todayDMonY(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')}-${MONTHS[now.getMonth()]}-${now.getFullYear()}`
}

/** 15655 → "15,655"; 15655.5 → "15,655.5" */
function reading(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rate4 = (n: number) => n.toFixed(4)
const pct = (fraction: number) => `${Math.round(fraction * 10000) / 100}%`

/** Standard PDF fonts only cover Latin-1: replace anything else so a name can never break the PDF. */
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')

/** "Pro-rate Electricity A-27-09 14-Nov-2026.pdf" */
export function proRateFileName(unitNo: string, eventDate: string): string {
  const unit = unitNo.replace(/[\\/:*?"<>|]+/g, '-').trim()
  return `Pro-rate Electricity ${unit} ${dMonY(eventDate)}.pdf`
}

// ── Attachment slot helpers (the original file name is kept as a "name" query tag on the stored URL) ──

export const PRO_RATE_PREFIX = 'Pro-rate Electricity'

export function withNameTag(url: string, name: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`
}

export function attachmentName(url: string | null): string | null {
  if (!url) return null
  const q = url.indexOf('?')
  if (q < 0) return null
  for (const part of url.slice(q + 1).split('&')) {
    const [k, v] = part.split('=')
    if (k === 'name' && v != null) {
      try { return decodeURIComponent(v) } catch { return v }
    }
  }
  return null
}

/**
 * Slot (0..2) for the pro-rate PDF: the slot already holding a "Pro-rate Electricity…" file (replaced),
 * else the first empty slot. null = all three hold other files (never overwritten).
 */
export function proRateSlot(urls: (string | null)[]): number | null {
  const existing = urls.findIndex((u) => attachmentName(u)?.startsWith(PRO_RATE_PREFIX))
  if (existing >= 0) return existing
  const empty = urls.findIndex((u) => !u)
  return empty >= 0 ? empty : null
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export async function buildProRatePdf(
  d: ElecProRateDetails,
  meta: { unitNo: string; tenantName?: string | null; updatedOn?: Date },
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [PW, PH] = [595.28, 841.89]
  const page = doc.addPage([PW, PH])
  doc.setTitle(safe(proRateFileName(meta.unitNo, d.eventDate).replace(/\.pdf$/, '')))

  const ink = rgb(0.1, 0.1, 0.1)
  const grey = rgb(0.45, 0.45, 0.45)
  const rule = rgb(0.75, 0.75, 0.75)
  const M = 56
  type Font = typeof regular

  const text = (s: string, x: number, y: number, size = 10, font: Font = regular, color = ink) =>
    page.drawText(safe(s), { x, y, size, font, color })
  const right = (s: string, xRight: number, y: number, size = 10, font: Font = regular, color = ink) =>
    text(s, xRight - font.widthOfTextAtSize(safe(s), size), y, size, font, color)
  const line = (y: number, x1 = M, x2 = PW - M, thickness = 0.6) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: rule })

  let y = PH - 48
  right(`Updated On: ${todayDMonY(meta.updatedOn ?? new Date())}`, PW - M, y, 8, regular, grey)

  y -= 30
  text('Pro-Rate Meter Reading Calculation For Electricity', M, y, 15, bold)
  y -= 8
  line(y, M, PW - M, 1)

  y -= 22
  text(`Unit No : ${meta.unitNo}`, M, y, 10.5)
  if (meta.tenantName && meta.tenantName.trim()) {
    y -= 16
    text(`Tenant Name : ${meta.tenantName.trim()}`, M, y, 10.5)
  }
  y -= 16
  text(`${d.isCheckIn ? 'Move-in' : 'Move-out'} Date : ${dMonthY(d.eventDate)}`, M, y, 10.5)

  y -= 32
  text('Pro-rate Calculation by Consumption', M, y, 12.5, bold)

  // ── A) Consumption details ──
  y -= 26
  text('A) Consumption Details', M, y, 10.5, bold)
  const aVal = M + 235
  const aAsOf = M + 255
  y -= 16
  right('Reading (kWh)', aVal, y, 8.5, bold, grey)
  text('As Of', aAsOf, y, 8.5, bold, grey)
  y -= 5
  line(y)
  const aRows: [string, string, string, string][] = [
    [
      'Current Meter Reading', reading(d.currentReading), dMonY(d.readingDate),
      d.readingDate === d.eventDate ? (d.isCheckIn ? 'Move in date' : 'Move out date') : 'Meter reading date',
    ],
    ['Previous Meter Reading', reading(d.previousReading), dMonY(d.previousDate), 'Last meter reading on the invoice'],
  ]
  for (const [label, val, asOf, note] of aRows) {
    y -= 16
    text(`${label} :`, M, y)
    right(val, aVal, y)
    text(asOf, aAsOf, y)
    text(note, aAsOf + 70, y, 8.5, regular, grey)
  }
  y -= 7
  line(y)
  y -= 15
  text('Total Consumption :', M, y, 10, bold)
  right(reading(d.stub.kwh), aVal, y, 10, bold)
  text('kWh', aVal + 6, y, 8.5, regular, grey)

  // ── B) Consumption charges ──
  y -= 32
  text('B) Consumption Charges', M, y, 10.5, bold)
  const bKwh = M + 255
  const bRate = M + 355
  const bChg = PW - M
  y -= 16
  right('Consumption (kWh)', bKwh, y, 8.5, bold, grey)
  right('Rate (RM/kWh)', bRate, y, 8.5, bold, grey)
  right('Charges (RM)', bChg, y, 8.5, bold, grey)
  y -= 5
  line(y)
  const s = d.stub
  const bRows: [string, number, number][] = [
    ['Energy Charges', d.rates.energy, s.energy],
    ['Capacity Charges', d.rates.capacity, s.capacity],
    ['Network Charges', d.rates.network, s.network],
    ['Energy Efficiency Incentive', 0, 0],
    ['Automatic Fuel Adjustment', d.rates.afa, s.afa],
  ]
  for (const [label, rate, charge] of bRows) {
    y -= 16
    text(label, M, y)
    right(reading(s.kwh), bKwh, y)
    right(rate4(rate), bRate, y)
    right(money(charge), bChg, y)
  }
  y -= 7
  line(y)
  y -= 15
  text('Total Charges', M, y, 10, bold)
  right(money(s.charges), bChg, y, 10, bold)

  // ── C) Total consumption charges ──
  y -= 32
  text('C) Total Consumption Charges (RM)', M, y, 10.5, bold)
  y -= 5
  line(y)
  const cRows: [string, number, boolean][] = [
    ['Consumption Charges', s.charges, false],
    [d.isCheckIn ? 'Retail Charges (50%)' : 'Retail Charges', s.retail, false],
    ['Subtotal', s.subtotal, true],
    [`Renewable Energy Charge (${pct(d.rePct)} x Energy + Capacity + Network Charges)`, s.re, false],
  ]
  for (const [label, amount, isBold] of cRows) {
    y -= 16
    text(label, M, y, 10, isBold ? bold : regular)
    right(money(amount), bChg, y, 10, isBold ? bold : regular)
  }

  // ── Payable ──
  y -= 34
  page.drawRectangle({ x: M, y: y - 9, width: PW - 2 * M, height: 28, color: rgb(0.95, 0.95, 0.95), borderColor: rule, borderWidth: 0.6 })
  text('Pro-rated Payable Amount :', M + 10, y, 12.5, bold)
  right(`RM ${money(s.total)}`, PW - M - 10, y, 12.5, bold)
  y -= 30
  text(
    d.isCheckIn
      ? 'Meter reading taken before tenant move-in: payable by the landlord.'
      : 'Meter reading taken at tenant move-out: payable by the tenant.',
    M, y, 10,
  )

  text('Figures are rounded for display; the total is calculated from unrounded amounts.', M, 40, 7.5, regular, grey)

  return doc.save()
}
