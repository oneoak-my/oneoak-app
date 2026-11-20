// Tenancy agreement → A4 PDF (pdf-lib, standard Times fonts, runs in the browser; nothing is uploaded).
// Layout follows the template: bordered cover, body clauses with margin headings on the right, initial box +
// page number on body pages, signing page, THE SCHEDULE table, SCHEDULE II.

import type { PDFFont, PDFPage, PDFDocument as PDFDocumentType } from 'pdf-lib'
import type { AgreementModel, BodyItem, Line, Run } from './model'
import type { RenderConfig } from './templates'

/** Standard PDF fonts use WinAnsi: map smart punctuation to plain text and drop anything else unprintable. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\t ]/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '?')
}

const PW = 595.28
const PH = 841.89
const LEFT = 64
const RIGHT = PW - 50
const BOTTOM = 96 // body text never goes below this (footer lives underneath)

interface Seg { text: string; bold: boolean }
/** One word; several segments when styling changes inside it (e.g. a bold value glued to plain text). */
type Word = Seg[]

export async function buildAgreementPdf(model: AgreementModel, cfg: RenderConfig): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc: PDFDocumentType = await PDFDocument.create()
  doc.setTitle(pdfSafe(model.fileStem))
  const regular = await doc.embedFont(StandardFonts.TimesRoman)
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic)
  const black = rgb(0, 0, 0)
  const grey = rgb(0.35, 0.35, 0.35)

  const SIZE = cfg.bodySize
  const LH = SIZE * 1.32
  const MARGIN_W = cfg.marginColumn
  const MARGIN_X = RIGHT - MARGIN_W
  const TEXT_RIGHT = MARGIN_X - 14
  const MSIZE = 8.5
  const MLH = MSIZE * 1.25

  const fontOf = (b: boolean) => (b ? bold : regular)
  const width = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(pdfSafe(s), size)

  let page: PDFPage = doc.addPage([PW, PH])
  let y = PH - 72
  const bodyPages: PDFPage[] = []
  const numberedPages: PDFPage[] = []

  const draw = (s: string, x: number, yy: number, size = SIZE, font: PDFFont = regular, color = black) => {
    if (s) page.drawText(pdfSafe(s), { x, y: yy, size, font, color })
  }
  const centre = (s: string, yy: number, size = SIZE, font: PDFFont = regular, x1 = LEFT, x2 = RIGHT) =>
    draw(s, (x1 + x2) / 2 - width(s, font, size) / 2, yy, size, font)
  const hline = (x1: number, x2: number, yy: number, t = 0.8) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color: black })
  const vline = (x: number, y1: number, y2: number, t = 0.8) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: t, color: black })

  function newPage(kind: 'body' | 'other') {
    page = doc.addPage([PW, PH])
    y = PH - 64
    numberedPages.push(page)
    if (kind === 'body') bodyPages.push(page)
  }

  const wordWidth = (w: Word, size: number) => w.reduce((s, g) => s + width(g.text, fontOf(g.bold), size), 0)
  const spaceW = (size: number) => width(' ', regular, size)

  /** Greedy word wrap of styled runs (a run boundary without a space stays inside one word). */
  function wrapRuns(runs: Run[], maxW: number, size: number): Word[][] {
    const words: Word[] = []
    let cur: Word = []
    for (const r of runs) {
      pdfSafe(r.text).split(' ').forEach((p, i) => {
        if (i > 0 && cur.length) { words.push(cur); cur = [] }
        if (p) cur.push({ text: p, bold: !!r.bold })
      })
    }
    if (cur.length) words.push(cur)
    const out: Word[][] = []
    let line: Word[] = []
    let lineW = 0
    for (const w of words) {
      const ww = wordWidth(w, size)
      const add = line.length ? spaceW(size) + ww : ww
      if (line.length && lineW + add > maxW) { out.push(line); line = [w]; lineW = ww }
      else { line.push(w); lineW += add }
    }
    if (line.length) out.push(line)
    return out.length ? out : [[]]
  }

  const lineWidth = (ws: Word[], size: number) =>
    ws.reduce((s, w, j) => s + wordWidth(w, size) + (j ? spaceW(size) : 0), 0)

  /** Draws one wrapped line; with `justifyW` the spaces stretch so the line fills that width. */
  function drawWords(ws: Word[], x: number, yy: number, size: number, justifyW: number | null) {
    const total = ws.reduce((s, w) => s + wordWidth(w, size), 0)
    const gaps = ws.length - 1
    const gap = justifyW != null && gaps > 0 ? (justifyW - total) / gaps : spaceW(size)
    let cx = x
    for (const w of ws) {
      for (const g of w) { draw(g.text, cx, yy, size, fontOf(g.bold)); cx += width(g.text, fontOf(g.bold), size) }
      cx += gap
    }
  }

  /** Paragraph of runs; justified unless `align` says otherwise. Breaks pages as needed. Returns nothing; moves y. */
  function paragraph(runs: Run[], x: number, maxW: number, opts: { size?: number; lh?: number; align?: 'justify' | 'left' | 'center'; kind?: 'body' | 'other' } = {}) {
    const size = opts.size ?? SIZE
    const lh = opts.lh ?? LH
    const ls = wrapRuns(runs, maxW, size)
    ls.forEach((ws, i) => {
      if (y - lh < BOTTOM - 20) newPage(opts.kind ?? 'other')
      y -= lh
      if (opts.align === 'center') {
        drawWords(ws, x + (maxW - lineWidth(ws, size)) / 2, y, size, null)
      } else {
        drawWords(ws, x, y, size, opts.align !== 'left' && i < ls.length - 1 ? maxW : null)
      }
    })
  }

  // ── Cover ────────────────────────────────────────────────────────────────
  {
    const inset = 36
    page.drawRectangle({ x: inset, y: inset, width: PW - 2 * inset, height: PH - 2 * inset, borderColor: black, borderWidth: 4 })
    page.drawRectangle({ x: inset + 6, y: inset + 6, width: PW - 2 * inset - 12, height: PH - 2 * inset - 12, borderColor: black, borderWidth: 1 })
    const c = model.cover
    type Item = { text: string; size: number; font: PDFFont; gapBefore: number }
    const items: Item[] = []
    const add = (text: string, size: number, font: PDFFont, gapBefore: number) => items.push({ text, size, font, gapBefore })
    const stars = '*'.repeat(38)
    add(c.date, 12, regular, 0)
    add(stars, 12, regular, 40)
    add('TENANCY AGREEMENT', 22, bold, 18)
    add(stars, 12, regular, 18)
    c.premisesLines.forEach((l, i) => add(l, 12, bold, i === 0 ? 46 : 4))
    add('between', 12, italic, 40)
    c.landlords.forEach((p, i) => { add(p.name, 12, bold, i === 0 ? 30 : 16); add(p.idLine, 11, regular, 3) })
    add('(the Landlord)', 11.5, regular, 14)
    add('and', 12, italic, 30)
    c.tenants.forEach((p, i) => { add(p.name, 12, bold, i === 0 ? 30 : 16); add(p.idLine, 11, regular, 3) })
    add('(the Tenant)', 11.5, regular, 14)
    // Shrink the gaps when there are many parties so everything stays inside the border.
    const textH = items.reduce((s, it) => s + it.size * 1.15, 0)
    const gapsH = items.reduce((s, it) => s + it.gapBefore, 0)
    const avail = PH - 2 * inset - 120
    const scale = Math.min(1, Math.max(0.2, (avail - textH) / gapsH))
    const used = textH + gapsH * scale
    y = PH / 2 + used / 2
    for (const it of items) {
      y -= it.gapBefore * scale + it.size * 1.15
      const fits = width(it.text, it.font, it.size) <= RIGHT - LEFT
      if (fits) centre(it.text, y, it.size, it.font)
      else {
        // Very long line (e.g. address typed on one line): wrap it, centred.
        const ls = wrapRuns([{ text: it.text, bold: it.font === bold }], RIGHT - LEFT, it.size)
        ls.forEach((ws, i) => {
          if (i > 0) y -= it.size * 1.2
          drawWords(ws, (PW - lineWidth(ws, it.size)) / 2, y, it.size, null)
        })
      }
    }
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  newPage('body')
  y = PH - 72

  function marginLines(item: BodyItem): string[][] {
    const out: string[][] = []
    for (const h of item.margin) {
      const ws = wrapRuns([{ text: h, bold: true }], MARGIN_W, MSIZE)
      out.push(ws.map((l) => l.map((w) => w.map((g) => g.text).join('')).join(' ')))
    }
    return out
  }

  for (const item of model.body) {
    if (item.kind === 'heading') {
      if (y - LH * 4 < BOTTOM) newPage('body')
      y -= 8
      paragraph([{ text: item.text, bold: true }], LEFT, TEXT_RIGHT - LEFT, { align: 'left', kind: 'body' })
      y -= 6
      continue
    }
    const numX = item.level === 0 ? LEFT : LEFT + 28
    const textX = item.no === '' && item.level === 0 ? LEFT : item.level === 0 ? LEFT + 28 : LEFT + 62
    const textW = TEXT_RIGHT - textX
    const ls = wrapRuns([{ text: item.text }], textW, SIZE)
    const ms = marginLines(item)
    const marginH = ms.reduce((s, g, i) => s + g.length * MLH + (i ? 4 : 0), 0)
    // Keep at least two lines (and the whole margin heading) with the clause start.
    if (y - Math.max(LH * Math.min(2, ls.length), marginH) < BOTTOM) newPage('body')
    const startPage = page
    // Margin heading(s): first baseline level with the clause's first line.
    let my = y - LH + MLH
    ms.forEach((g, gi) => {
      if (gi) my -= 4
      for (const l of g) { my -= MLH; draw(l, MARGIN_X, my, MSIZE, bold) }
    })
    // Number + text
    ls.forEach((ws, i) => {
      if (y - LH < BOTTOM) newPage('body')
      y -= LH
      if (i === 0 && item.no) draw(`${item.no}${item.level === 0 ? '.' : ''}`, numX, y, SIZE, item.level === 0 ? bold : regular)
      drawWords(ws, textX, y, SIZE, i < ls.length - 1 ? textW : null)
    })
    if (page === startPage && my < y) y = my
    y -= 9
  }

  // ── Signing page ─────────────────────────────────────────────────────────
  newPage('other')
  paragraph([{ text: model.testimonium }], LEFT, RIGHT - LEFT)
  y -= 26
  const BRACKET_X = LEFT + 270
  const SIGN_X1 = BRACKET_X + 24
  for (const b of model.signing) {
    const h = (1 + b.signer.length + b.witness.length) * LH + 34
    if (y - h < 60) newPage('other')
    const rows: { line: Line; dotted: boolean }[] = [
      { line: [{ text: b.heading, bold: true }], dotted: false },
      ...b.signer.map((line, i) => ({ line, dotted: i === 0 })),
      { line: [], dotted: false },
      ...b.witness.map((line, i) => ({ line, dotted: i === 1 })),
    ]
    for (const r of rows) {
      y -= LH + (r.line.length === 0 ? -LH * 0.4 : 0)
      if (r.line.length) {
        drawWords(wrapRuns(r.line, 400, SIZE)[0], LEFT, y, SIZE, null)
        draw(')', BRACKET_X, y)
      }
      if (r.dotted) draw('.'.repeat(60), SIGN_X1, y)
    }
    y -= 30
  }

  // ── THE SCHEDULE ─────────────────────────────────────────────────────────
  newPage('other')
  centre(model.schedule.title, (y -= 16), 13, bold)
  y -= 4
  centre(model.schedule.subtitle, (y -= 13), 9.5, italic)
  y -= 14
  const COLS = [LEFT, LEFT + 52, LEFT + 200, RIGHT]
  const PAD = 5
  const cellW = (i: number) => COLS[i + 1] - COLS[i] - 2 * PAD
  function tableHeader(cols: string[], xs: number[]) {
    const h = LH + 8
    page.drawRectangle({ x: xs[0], y: y - h, width: xs[xs.length - 1] - xs[0], height: h, color: rgb(0.9, 0.9, 0.9) })
    hline(xs[0], xs[xs.length - 1], y)
    cols.forEach((c, i) => centre(c, y - h + 6, 9.5, bold, xs[i], xs[i + 1]))
    xs.forEach((x) => vline(x, y, y - h))
    y -= h
    hline(xs[0], xs[xs.length - 1], y)
  }
  tableHeader(model.schedule.columns, COLS)
  for (const row of model.schedule.rows) {
    const itemLs = wrapRuns([{ text: row.item }], cellW(1), SIZE)
    const partLs = row.lines.flatMap((l) => (l.every((r) => !r.text) ? [[]] : wrapRuns(l, cellW(2), SIZE)))
    const n = Math.max(1, itemLs.length, partLs.length)
    const h = n * LH + 2 * PAD
    if (y - h < 60) {
      newPage('other')
      tableHeader(model.schedule.columns, COLS)
    }
    const top = y
    draw(row.no, COLS[0] + PAD, top - PAD - SIZE)
    itemLs.forEach((ws, i) => drawWords(ws, COLS[1] + PAD, top - PAD - SIZE - i * LH, SIZE, null))
    partLs.forEach((ws, i) => drawWords(ws, COLS[2] + PAD, top - PAD - SIZE - i * LH, SIZE, null))
    y -= h
    COLS.forEach((x) => vline(x, top, y))
    hline(COLS[0], COLS[3], y)
  }

  // ── SCHEDULE II ──────────────────────────────────────────────────────────
  const s2 = model.scheduleII
  newPage('other')
  centre(s2.title, (y -= 16), 13, bold)
  centre(s2.subtitle, (y -= 18), 11, bold)
  y -= 8
  paragraph([{ text: s2.intro }], LEFT, RIGHT - LEFT, { size: 10, lh: 13 })
  y -= 10
  const X2 = [LEFT, (LEFT + RIGHT) / 2, RIGHT]
  tableHeader(s2.table_header, X2)
  const nRows = Math.max(s2.landlord_items.length, s2.tenant_items.length)
  for (let i = 0; i < nRows; i++) {
    const cellW2 = X2[1] - X2[0] - 2 * PAD
    // Each cell: "1. Item" then the note in brackets, slightly smaller and indented.
    const cell = (it: string[] | undefined) => {
      if (!it) return [] as { ws: Word[]; dx: number; size: number }[]
      const [name, ...rest] = it
      return [
        ...wrapRuns([{ text: `${i + 1}. ${name}` }], cellW2, 10).map((ws) => ({ ws, dx: 0, size: 10 })),
        ...rest.flatMap((r) => wrapRuns([{ text: r }], cellW2 - 12, 9).map((ws) => ({ ws, dx: 12, size: 9 }))),
      ]
    }
    const a = cell(s2.landlord_items[i])
    const b = cell(s2.tenant_items[i])
    const h = Math.max(a.length, b.length) * 12.5 + 2 * PAD
    if (y - h < 60) { newPage('other'); tableHeader(s2.table_header, X2) }
    const top = y
    a.forEach((c, j) => drawWords(c.ws, X2[0] + PAD + c.dx, top - PAD - 9.5 - j * 12.5, c.size, null))
    b.forEach((c, j) => drawWords(c.ws, X2[1] + PAD + c.dx, top - PAD - 9.5 - j * 12.5, c.size, null))
    y -= h
    X2.forEach((x) => vline(x, top, y))
    hline(X2[0], X2[2], y)
  }
  y -= 12
  draw(s2.table_note, LEFT, y, 9, italic)
  y -= 10
  paragraph([{ text: s2.termination_intro }], LEFT, RIGHT - LEFT, { size: 10, lh: 13 })
  y -= 2
  s2.termination_items.forEach((t, i) => {
    const ls = wrapRuns([{ text: t }], RIGHT - LEFT - 22, 10)
    ls.forEach((ws, j) => {
      if (y - 13 < 60) newPage('other')
      y -= 13
      if (j === 0) draw(`${i + 1}.`, LEFT + 2, y, 10)
      drawWords(ws, LEFT + 22, y, 10, j < ls.length - 1 ? RIGHT - LEFT - 22 : null)
    })
    y -= 3
  })
  if (y - 130 < 50) newPage('other')
  y -= 34
  const half = (RIGHT - LEFT) / 2
  const sigCol = (x: number, heading: string, name: string) => {
    let yy = y
    draw(heading, x, yy, 10, bold)
    yy -= 44
    draw('.'.repeat(52), x, yy, 10)
    yy -= 16
    draw(`Name: ${name}`, x, yy, 10)
    yy -= 16
    draw('Date:', x, yy, 10)
  }
  sigCol(LEFT, 'Signed by the Landlord in the presence of:', s2.landlordName)
  sigCol(LEFT + half + 10, 'Confirmed by the Tenant in the presence of:', s2.tenantName)

  // ── Footers: page number on every numbered page, initial box on body pages ──
  numberedPages.forEach((p, i) => {
    const label = String(i + 1)
    p.drawText(label, { x: PW / 2 - regular.widthOfTextAtSize(label, 9) / 2, y: 30, size: 9, font: regular, color: grey })
  })
  for (const p of bodyPages) {
    const bw = 58, lh = 12, bh = 30
    const x0 = RIGHT - 2 * bw
    const y0 = 26
    p.drawRectangle({ x: x0, y: y0, width: 2 * bw, height: lh + bh, borderColor: black, borderWidth: 0.7 })
    p.drawLine({ start: { x: x0 + bw, y: y0 }, end: { x: x0 + bw, y: y0 + lh + bh }, thickness: 0.7, color: black })
    p.drawLine({ start: { x: x0, y: y0 + bh }, end: { x: x0 + 2 * bw, y: y0 + bh }, thickness: 0.7, color: black })
    ;['Landlord', 'Tenant'].forEach((t, i) => {
      const w = regular.widthOfTextAtSize(t, 8)
      p.drawText(t, { x: x0 + i * bw + bw / 2 - w / 2, y: y0 + bh + 3, size: 8, font: regular, color: black })
    })
  }

  return doc.save()
}
