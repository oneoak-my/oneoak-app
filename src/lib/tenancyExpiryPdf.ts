// "Tenancy Expiry for <date>" list as an A4 portrait PDF (pdf-lib + fontkit, embedded Verdana, runs in the browser).
// Narrow margins and a small font so every column fits; all text wraps inside its cell; header repeats on every page.

import type { PDFFont, PDFPage } from 'pdf-lib'
import { formatRental, shortDate, type ExpiryRow } from './tenancyExpiry'

export interface ExpiryPdfFonts { verdana: ArrayBuffer | Uint8Array; verdanaBold: ArrayBuffer | Uint8Array }

const PW = 595.28
const PH = 841.89
const MARGIN = 30
const SIZE = 7.5
const LINE = 9.4
const PAD = 3.5

export const expiryPdfFileName = (label: string) => `Tenancy Expiry for ${label.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`

/** Column widths in points (they always add up to the 535.28 pt text width). */
export function expiryColumns(includeRemarks: boolean): { title: string; width: number }[] {
  const base = [
    { title: 'No', width: 20 },
    { title: 'Tenancy Expiry Date', width: 52 },
    { title: 'Property (Unit No, Building Name)', width: 104 },
    { title: 'Owner / Tenant', width: 106 },
    { title: 'Rental Amount', width: 58 },
    { title: 'Original TA Start Date', width: 52 },
    { title: 'COA Name', width: 66 },
  ]
  const total = PW - 2 * MARGIN
  if (includeRemarks) {
    const cols = [...base, { title: 'Remark', width: 0 }]
    cols[cols.length - 1].width = total - base.reduce((s, c) => s + c.width, 0)
    return cols
  }
  const sum = base.reduce((s, c) => s + c.width, 0)
  return base.map((c) => ({ ...c, width: (c.width * total) / sum }))
}

/** Replace characters Verdana cannot show so a name can never break the PDF. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA1-\xFF]/g, '?')

export async function buildExpiryPdf(
  rows: ExpiryRow[],
  opts: { label: string; includeRemarks: boolean; remarks: Record<string, string> },
  fonts: ExpiryPdfFonts,
): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkitMod] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')])
  const doc = await PDFDocument.create()
  const fontkit = ('default' in fontkitMod && fontkitMod.default ? fontkitMod.default : fontkitMod) as Parameters<typeof doc.registerFontkit>[0]
  doc.registerFontkit(fontkit)
  const u8 = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(b))
  const regular = await doc.embedFont(u8(fonts.verdana), { subset: true })
  const bold = await doc.embedFont(u8(fonts.verdanaBold), { subset: true })
  const title = `Tenancy Expiry for ${opts.label}`
  doc.setTitle(safe(title))
  const black = rgb(0, 0, 0)
  const grey = rgb(0.9, 0.9, 0.9)

  const cols = expiryColumns(opts.includeRemarks)
  const xs = cols.reduce<number[]>((acc, c) => [...acc, acc[acc.length - 1] + c.width], [MARGIN])

  /** Wraps text to a width; words longer than the width are split by characters (never run past the cell). */
  function wrap(text: string, w: number, font: PDFFont): string[] {
    const out: string[] = []
    for (const para of text.split('\n').map(safe)) {
      let line = ''
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const tryLine = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(tryLine, SIZE) <= w) { line = tryLine; continue }
        if (line) out.push(line)
        // Split an over-long word.
        let rest = word
        while (font.widthOfTextAtSize(rest, SIZE) > w) {
          let k = rest.length - 1
          while (k > 1 && font.widthOfTextAtSize(rest.slice(0, k), SIZE) > w) k--
          out.push(rest.slice(0, k))
          rest = rest.slice(k)
        }
        line = rest
      }
      out.push(line)
    }
    return out.length ? out : ['']
  }

  const cellLines = (texts: string[], font: PDFFont) => texts.map((t, i) => wrap(t, cols[i].width - 2 * PAD, font))
  const rowHeight = (lines: string[][]) => Math.max(...lines.map((l) => l.length)) * LINE + 2 * PAD

  let page = null as unknown as PDFPage
  let y = 0
  let pageCount = 0
  const pages: PDFPage[] = []
  const headLines = cellLines(cols.map((c) => c.title), bold)

  function drawRow(lines: string[][], font: PDFFont, shade: boolean) {
    const h = rowHeight(lines)
    if (shade) page.drawRectangle({ x: MARGIN, y: y - h, width: xs[xs.length - 1] - MARGIN, height: h, color: grey })
    lines.forEach((ls, i) => ls.forEach((l, k) => {
      if (l) page.drawText(l, { x: xs[i] + PAD, y: y - PAD - SIZE - k * LINE + 1, size: SIZE, font, color: black })
    }))
    page.drawLine({ start: { x: MARGIN, y }, end: { x: xs[xs.length - 1], y }, thickness: 0.5, color: black })
    page.drawLine({ start: { x: MARGIN, y: y - h }, end: { x: xs[xs.length - 1], y: y - h }, thickness: 0.5, color: black })
    xs.forEach((x) => page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.5, color: black }))
    y -= h
  }

  function newPage() {
    page = doc.addPage([PW, PH])
    pages.push(page)
    pageCount++
    y = PH - MARGIN
    if (pageCount === 1) {
      const tw = bold.widthOfTextAtSize(safe(title), 12)
      page.drawText(safe(title), { x: (PW - tw) / 2, y: y - 12, size: 12, font: bold, color: black })
      y -= 26
    }
    drawRow(headLines, bold, true)
  }

  newPage()
  const BOTTOM = MARGIN + 14
  if (!rows.length) {
    page.drawText('No tenancies in this period.', { x: MARGIN, y: y - 14, size: SIZE, font: regular, color: black })
  }
  rows.forEach((r, i) => {
    const texts = [
      String(i + 1),
      shortDate(r.expiry),
      [r.unitNo, r.building].filter(Boolean).join(', '),
      `${r.owner ?? '-'}\n${r.tenant ?? '-'}`,
      r.rental != null ? `RM ${formatRental(r.rental)}` : '',
      shortDate(r.originalStart),
      r.coaName ?? '',
      ...(opts.includeRemarks ? [opts.remarks[r.sourceKey] ?? ''] : []),
    ]
    const lines = cellLines(texts, regular)
    if (y - rowHeight(lines) < BOTTOM) newPage()
    drawRow(lines, regular, false)
  })

  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`
    p.drawText(label, { x: (PW - regular.widthOfTextAtSize(label, 7)) / 2, y: MARGIN - 12, size: 7, font: regular, color: black })
  })
  return doc.save()
}
