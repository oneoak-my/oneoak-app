// Tenancy agreement → A4 PDF (pdf-lib + fontkit, runs in the browser; nothing is uploaded).
// Fonts, margins and initial boxes follow the original template:
//   cover: Calibri (date line Verdana 15) · body, signing page, schedules: Verdana 10 ·
//   margin headings Arial 7, initial boxes Arial 8, page number Arial 9 (Arial = PDF standard Helvetica, same widths).
// Margins: cover/clauses/signing L 78 R 92.1 T 63 B 21.6 footer 14.4; schedules L 90 R 90 T 58.5 B 38.8 footer 36.

import type { PDFFont, PDFPage, PDFDocument as PDFDocumentType } from 'pdf-lib'
import type { AgreementModel, BodyItem, Line, Run } from './model'
import type { RenderConfig } from './templates'
import type { AgreementFontBytes } from './pdfFonts'

/** Map smart punctuation to plain text and drop anything the fonts cannot print. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\t ]/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '?')
}

const PW = 595.28
const PH = 841.89

/** Page groups of the original template (points). */
export const PAGE_GROUPS = {
  main: { left: 78, right: 92.1, top: 63, bottom: 21.6, footer: 14.4, box: [57.35, 58.3] },
  schedule: { left: 36, right: 36, top: 58.5, bottom: 38.8, footer: 36, box: [53.35, 52.4] },
  /** Schedule II when it needs a little more width to stay on one page. */
  scheduleTight: { left: 30, right: 30, top: 58.5, bottom: 38.8, footer: 36, box: [53.35, 52.4] },
} as const
export type PageGroup = keyof typeof PAGE_GROUPS

/** Initial box geometry shared by PDF and tests. */
export const INITIAL_BOX = { rowHeight: 13.15, border: 0.5, pad: 5.4, offsetFromLeftMargin: 320.4, fontSize: 8 }
const PAGE_NO_SIZE = 9
const PAGE_NO_LINE = PAGE_NO_SIZE * 1.15

/** Lowest y body text may use on a page of this group (just above the initial box). */
export function bodyBottom(g: PageGroup): number {
  return PAGE_GROUPS[g].footer + PAGE_NO_LINE + 1 + 2 * INITIAL_BOX.rowHeight + 6
}

/** Spacing chosen so each page fits (shared with the Word file so both look the same). */
export interface AgreementLayout {
  signing: { above: number; between: number; groups: number; onePage: boolean }
  schedule: { size: number; pad: number; onePage: boolean }
  scheduleII: { margin: number; pad: number; para: number; sigGap: number; step: number; lineHeight: number; onePage: boolean }
}

/** Signing page spacing: roomy target and the minimum it may shrink to. */
export const SIGNING_SPACING = { max: { above: 40, between: 28, groups: 40 }, min: { above: 22, between: 14, groups: 24 }, dotted: 200 }
const SCHEDULE_FITS = [{ size: 10, pad: 5 }, { size: 10, pad: 4 }, { size: 10, pad: 3 }, { size: 10, pad: 2 }, { size: 9, pad: 2 }]
const SCHEDULE_II_FITS = [
  { margin: 36, pad: 4, para: 1, sigGap: 30, step: 15, lineHeight: 12.5 },
  { margin: 36, pad: 3, para: 0.7, sigGap: 26, step: 14, lineHeight: 12.5 },
  { margin: 36, pad: 2, para: 0.5, sigGap: 22, step: 13, lineHeight: 12.3 },
  { margin: 30, pad: 2, para: 0.4, sigGap: 18, step: 12.5, lineHeight: 12.1 },
  { margin: 30, pad: 1.5, para: 0.25, sigGap: 14, step: 12.1, lineHeight: 12.1 },
]

type Family = 'verdana' | 'calibri' | 'arial'
interface Seg { text: string; bold: boolean }
/** One word; several segments when styling changes inside it (e.g. a bold value glued to plain text). */
type Word = Seg[]

export async function buildAgreementPdf(model: AgreementModel, cfg: RenderConfig, fontBytes: AgreementFontBytes): Promise<Uint8Array> {
  return (await buildAgreementPdfWithLayout(model, cfg, fontBytes)).bytes
}

export async function buildAgreementPdfWithLayout(
  model: AgreementModel, cfg: RenderConfig, fontBytes: AgreementFontBytes,
): Promise<{ bytes: Uint8Array; layout: AgreementLayout }> {
  const [{ PDFDocument, StandardFonts, rgb }, fontkitMod] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')])
  const doc: PDFDocumentType = await PDFDocument.create()
  const fontkit = ('default' in fontkitMod && fontkitMod.default ? fontkitMod.default : fontkitMod) as Parameters<typeof doc.registerFontkit>[0]
  doc.registerFontkit(fontkit)
  doc.setTitle(pdfSafe(model.fileStem))
  const embed = (b: ArrayBuffer | Uint8Array) => doc.embedFont(b instanceof Uint8Array ? b : new Uint8Array(b), { subset: true })
  const [verdana, verdanaBold, calibri, calibriBold, arial, arialBold] = await Promise.all([
    embed(fontBytes.verdana), embed(fontBytes.verdanaBold), embed(fontBytes.calibri), embed(fontBytes.calibriBold),
    doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold),
  ])
  const FONTS: Record<Family, [PDFFont, PDFFont]> = {
    verdana: [verdana, verdanaBold], calibri: [calibri, calibriBold], arial: [arial, arialBold],
  }
  const black = rgb(0, 0, 0)

  const SIZE = cfg.bodySize
  const LH = SIZE * 1.25
  const MSIZE = 7
  const MLH = MSIZE * 1.2

  // Current page geometry (changes with the page group).
  let group: PageGroup = 'main'
  let L: number = PAGE_GROUPS.main.left
  let R = PW - PAGE_GROUPS.main.right
  let BOTTOM = bodyBottom('main')

  const fontOf = (b: boolean, fam: Family = 'verdana') => FONTS[fam][b ? 1 : 0]
  const width = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(pdfSafe(s), size)

  let page: PDFPage = doc.addPage([PW, PH])
  let y = PH - PAGE_GROUPS.main.top
  const footerPages: { page: PDFPage; group: PageGroup }[] = []

  // Measuring pass: with `dry` on nothing is drawn and a page break only records that the content overflowed.
  let dry = false
  let dryOverflow = false
  const draw = (s: string, x: number, yy: number, size = SIZE, font: PDFFont = verdana, color = black) => {
    if (s && !dry) page.drawText(pdfSafe(s), { x, y: yy, size, font, color })
  }
  const centre = (s: string, yy: number, size = SIZE, font: PDFFont = verdana, x1 = L, x2 = R) =>
    draw(s, (x1 + x2) / 2 - width(s, font, size) / 2, yy, size, font)
  const hline = (x1: number, x2: number, yy: number, t = 0.8) => {
    if (!dry) page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color: black })
  }
  const vline = (x: number, y1: number, y2: number, t = 0.8) => {
    if (!dry) page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: t, color: black })
  }

  /** Runs `render` without drawing; true when it stays on the current page. */
  function fitsOnPage(render: () => void): boolean {
    const saved = y
    dry = true
    dryOverflow = false
    try { render() } finally { dry = false }
    const ok = !dryOverflow && y >= BOTTOM
    y = saved
    return ok
  }

  function newPage(g: PageGroup) {
    if (dry) { dryOverflow = true; y = PH - PAGE_GROUPS[g].top; return }
    page = doc.addPage([PW, PH])
    group = g
    L = PAGE_GROUPS[g].left
    R = PW - PAGE_GROUPS[g].right
    BOTTOM = bodyBottom(g)
    y = PH - PAGE_GROUPS[g].top
    footerPages.push({ page, group: g })
  }

  const wordWidth = (w: Word, size: number, fam: Family) => w.reduce((s, g) => s + width(g.text, fontOf(g.bold, fam), size), 0)
  const spaceW = (size: number, fam: Family) => width(' ', fontOf(false, fam), size)

  /** Greedy word wrap of styled runs, measured with the embedded font (a run boundary without a space stays in one word). */
  function wrapRuns(runs: Run[], maxW: number, size: number, fam: Family = 'verdana'): Word[][] {
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
      const ww = wordWidth(w, size, fam)
      const add = line.length ? spaceW(size, fam) + ww : ww
      if (line.length && lineW + add > maxW) { out.push(line); line = [w]; lineW = ww }
      else { line.push(w); lineW += add }
    }
    if (line.length) out.push(line)
    return out.length ? out : [[]]
  }

  const lineWidth = (ws: Word[], size: number, fam: Family = 'verdana') =>
    ws.reduce((s, w, j) => s + wordWidth(w, size, fam) + (j ? spaceW(size, fam) : 0), 0)

  /** Draws one wrapped line; with `justifyW` the spaces stretch so the line fills that width. */
  function drawWords(ws: Word[], x: number, yy: number, size: number, justifyW: number | null, fam: Family = 'verdana') {
    const total = ws.reduce((s, w) => s + wordWidth(w, size, fam), 0)
    const gaps = ws.length - 1
    const gap = justifyW != null && gaps > 0 ? (justifyW - total) / gaps : spaceW(size, fam)
    let cx = x
    for (const w of ws) {
      for (const g of w) { draw(g.text, cx, yy, size, fontOf(g.bold, fam)); cx += width(g.text, fontOf(g.bold, fam), size) }
      cx += gap
    }
  }

  /** Paragraph of runs; justified unless `align` says otherwise. Breaks pages (same group) as needed. */
  function paragraph(runs: Run[], x: number, maxW: number, opts: { align?: 'justify' | 'left' | 'center' } = {}) {
    const ls = wrapRuns(runs, maxW, SIZE)
    ls.forEach((ws, i) => {
      if (y - LH < BOTTOM) newPage(group)
      y -= LH
      if (opts.align === 'center') drawWords(ws, x + (maxW - lineWidth(ws, SIZE)) / 2, y, SIZE, null)
      else drawWords(ws, x, y, SIZE, opts.align !== 'left' && i < ls.length - 1 ? maxW : null)
    })
  }

  // ── Cover (Calibri; date Verdana 15) ─────────────────────────────────────
  {
    const inset = 36
    page.drawRectangle({ x: inset, y: inset, width: PW - 2 * inset, height: PH - 2 * inset, borderColor: black, borderWidth: 4 })
    page.drawRectangle({ x: inset + 6, y: inset + 6, width: PW - 2 * inset - 12, height: PH - 2 * inset - 12, borderColor: black, borderWidth: 1 })
    const c = model.cover
    type Item = { text: string; size: number; fam: Family; bold: boolean; gapBefore: number }
    const items: Item[] = []
    const add = (text: string, size: number, fam: Family, bold: boolean, gapBefore: number) => items.push({ text, size, fam, bold, gapBefore })
    const stars = '*'.repeat(38)
    add(c.date, 15, 'verdana', false, 0)
    add(stars, 12, 'calibri', false, 34)
    add('TENANCY AGREEMENT', 36, 'calibri', true, 10)
    add(stars, 12, 'calibri', false, 10)
    c.premisesLines.forEach((l, i) => add(l, 22, 'calibri', true, i === 0 ? 40 : 2))
    add('between', 18, 'calibri', false, 34)
    c.landlords.forEach((p, i) => { add(p.name, 18, 'calibri', true, i === 0 ? 26 : 12); add(p.idLine, 16, 'calibri', false, 1) })
    add('(the Landlord)', 18, 'calibri', false, 12)
    add('and', 18, 'calibri', false, 26)
    c.tenants.forEach((p, i) => { add(p.name, 18, 'calibri', true, i === 0 ? 26 : 12); add(p.idLine, 16, 'calibri', false, 1) })
    add('(the Tenant)', 18, 'calibri', false, 12)
    const maxW = R - L
    const linesOf = (it: Item) => wrapRuns([{ text: it.text, bold: it.bold }], maxW, it.size, it.fam)
    // Shrink the gaps when there are many parties so everything stays inside the border.
    const textH = items.reduce((s, it) => s + linesOf(it).length * it.size * 1.15, 0)
    const gapsH = items.reduce((s, it) => s + it.gapBefore, 0)
    const avail = PH - 2 * inset - 80
    const scale = Math.min(1, Math.max(0.1, (avail - textH) / gapsH))
    y = PH / 2 + (textH + gapsH * scale) / 2
    for (const it of items) {
      y -= it.gapBefore * scale
      for (const ws of linesOf(it)) {
        y -= it.size * 1.15
        drawWords(ws, L + (maxW - lineWidth(ws, it.size, it.fam)) / 2, y + it.size * 0.2, it.size, null, it.fam)
      }
    }
  }

  // ── Body (Verdana 10; margin headings Arial 7 in the right page margin) ─
  newPage('main')
  const BODY = cfg.body
  const BLH = BODY.lineHeight
  const TEXT_RIGHT = BODY.textRight

  function marginLines(item: BodyItem): string[][] {
    return item.margin.map((h) =>
      wrapRuns([{ text: h, bold: true }], BODY.marginWidth, MSIZE, 'arial').map((l) => l.map((w) => w.map((g) => g.text).join('')).join(' ')))
  }

  for (const item of model.body) {
    if (item.kind === 'heading') {
      if (y - BLH * 4 < BOTTOM) newPage('main')
      y -= 8
      for (const ws of wrapRuns(item.runs, TEXT_RIGHT - L, SIZE)) { y -= BLH; drawWords(ws, L, y, SIZE, null) }
      y -= 6
      continue
    }
    // Numbered clauses and sub-clauses: number at numberX, text at textX. The preamble (no number) starts at the margin.
    const textX = item.no === '' ? L : BODY.textX
    const textW = TEXT_RIGHT - textX
    const ls = wrapRuns(item.runs, textW, SIZE)
    const ms = marginLines(item)
    const marginH = ms.reduce((s, g, i) => s + g.length * MLH + (i ? 4 : 0), 0)
    // Keep at least two lines (and the whole margin heading) with the clause start.
    if (y - Math.max(BLH * Math.min(2, ls.length), marginH) < BOTTOM) newPage('main')
    const startPage = page
    // Margin heading(s): placed absolutely in the right page margin, first baseline level with the clause's first line.
    let my = y - BLH + MLH
    ms.forEach((g, gi) => {
      if (gi) my -= 4
      for (const l of g) { my -= MLH; draw(l, BODY.marginX, my, MSIZE, arialBold) }
    })
    ls.forEach((ws, i) => {
      if (y - BLH < BOTTOM) newPage('main')
      y -= BLH
      if (i === 0 && item.no) draw(`${item.no}${item.level === 0 ? '.' : ''}`, BODY.numberX, y, SIZE, item.level === 0 ? verdanaBold : verdana)
      drawWords(ws, textX, y, SIZE, i < ls.length - 1 ? textW : null)
    })
    if (page === startPage && my < y) y = my
    y -= 9
  }

  // ── Signing page (own page, same margins as the clauses) ────────────────
  // One heading per side; every signer gets empty space above a long dotted line; the side's witness once.
  // All landlords and tenants stay on this page: spacing shrinks evenly (to the minimum) before anything moves.
  const dotsFor = (w: number, size = SIZE) => '.'.repeat(Math.max(10, Math.floor(w / width('.', verdana, size))))
  const SIGN_R = R
  const SIGN_X1 = SIGN_R - SIGNING_SPACING.dotted
  const BRACKET_X = SIGN_X1 - 14
  type SignSpacing = { above: number; between: number; groups: number }
  function renderSigning(sp: SignSpacing, tenantsOnNextPage = false) {
    paragraph([{ text: model.testimonium }], L, R - L)
    model.signing.forEach((side, si) => {
      // Last resort only (minimum spacing still too tall): the tenant group starts a new page, never split inside a group.
      if (si > 0 && tenantsOnNextPage) newPage('main')
      else y -= si === 0 ? 24 : sp.groups
      const row = (words: Word[], dotted: boolean) => {
        if (y - LH < BOTTOM) newPage('main')
        y -= LH
        drawWords(words, L, y, SIZE, null)
        draw(')', BRACKET_X, y)
        if (dotted) draw(dotsFor(SIGN_R - SIGN_X1), SIGN_X1, y)
      }
      const lines = (line: Line, dotted: boolean) =>
        wrapRuns(line, BRACKET_X - L - 8, SIZE).forEach((words, k) => row(words, dotted && k === 0))
      // Empty space above a signature line, with the ")" column continuing.
      const space = (h: number) => {
        const steps = Math.max(1, Math.round(h / LH))
        for (let k = 0; k < steps; k++) {
          if (y - h / steps < BOTTOM) newPage('main')
          y -= h / steps
          if (k < steps - 1) draw(')', BRACKET_X, y)
        }
      }
      lines([{ text: side.heading, bold: true }], false)
      side.signers.forEach((signer, k) => {
        if (k > 0) y -= sp.between
        space(sp.above)
        signer.forEach((line, i) => lines(line, i === 0))
      })
      y -= sp.between
      lines(side.witness[0], false)
      space(sp.above)
      side.witness.slice(1).forEach((line, i) => lines(line, i === 0))
    })
  }
  const lerp = (t: number): SignSpacing => {
    const { max, min } = SIGNING_SPACING
    return { above: min.above + (max.above - min.above) * t, between: min.between + (max.between - min.between) * t, groups: min.groups + (max.groups - min.groups) * t }
  }
  newPage('main')
  let signT = 1
  while (signT > 0 && !fitsOnPage(() => renderSigning(lerp(signT)))) signT = Math.max(0, +(signT - 0.05).toFixed(2))
  const signSpacing = lerp(signT)
  const signingOnePage = fitsOnPage(() => renderSigning(signSpacing))
  renderSigning(signSpacing, !signingOnePage)

  // ── THE SCHEDULE (one page: shrink cell padding first, then 10 → 9 pt) ───
  function tableHeader(cols: string[], xs: number[], size: number) {
    const lh = size * 1.25
    const cellLines = cols.map((c, i) => wrapRuns([{ text: c, bold: true }], xs[i + 1] - xs[i] - 4, size))
    const h = Math.max(...cellLines.map((l) => l.length)) * lh + 8
    if (!dry) page.drawRectangle({ x: xs[0], y: y - h, width: xs[xs.length - 1] - xs[0], height: h, color: rgb(0.9, 0.9, 0.9) })
    hline(xs[0], xs[xs.length - 1], y)
    cellLines.forEach((ls, i) => ls.forEach((ws, k) => drawWords(ws, (xs[i] + xs[i + 1]) / 2 - lineWidth(ws, size) / 2, y - 4 - size - k * lh + 1, size, null)))
    xs.forEach((x) => vline(x, y, y - h))
    y -= h
    hline(xs[0], xs[xs.length - 1], y)
  }
  function renderSchedule(size: number, pad: number) {
    const lh = size * 1.25
    y -= LH
    centre(model.schedule.title, y, SIZE, verdanaBold)
    y -= 2
    paragraph([{ text: model.schedule.subtitle }], L, R - L, { align: 'center' })
    y -= 8
    // SECT NO ≈ 40 pt | ITEMS ≈ 120 pt | PARTICULARS = the rest (≈ 363 pt on a 523 pt table)
    const COLS = [L, L + 40, L + 160, R]
    const cellW = (i: number) => COLS[i + 1] - COLS[i] - 2 * pad
    tableHeader(model.schedule.columns, COLS, size)
    for (const row of model.schedule.rows) {
      const noLs = wrapRuns([{ text: row.no }], cellW(0), size)
      const itemLs = wrapRuns([{ text: row.item }], cellW(1), size)
      const partLs = row.lines.flatMap((l) => (l.every((r) => !r.text) ? [[]] : wrapRuns(l, cellW(2), size)))
      const n = Math.max(1, noLs.length, itemLs.length, partLs.length)
      const h = n * lh + 2 * pad
      if (y - h < BOTTOM) {
        newPage('schedule')
        tableHeader(model.schedule.columns, COLS, size)
      }
      const top = y
      const base = top - pad - size
      noLs.forEach((ws, i) => drawWords(ws, COLS[0] + pad, base - i * lh, size, null))
      itemLs.forEach((ws, i) => drawWords(ws, COLS[1] + pad, base - i * lh, size, null))
      partLs.forEach((ws, i) => drawWords(ws, COLS[2] + pad, base - i * lh, size, null))
      y -= h
      COLS.forEach((x) => vline(x, top, y))
      hline(COLS[0], COLS[3], y)
    }
  }
  newPage('schedule')
  const schedFit = SCHEDULE_FITS.find((f) => fitsOnPage(() => renderSchedule(f.size, f.pad))) ?? null
  const schedChoice = schedFit ?? SCHEDULE_FITS[SCHEDULE_FITS.length - 1]
  renderSchedule(schedChoice.size, schedChoice.pad)

  // ── SCHEDULE II (one page, Verdana 10 kept; spacing and padding shrink) ──
  const s2 = model.scheduleII
  type S2Fit = (typeof SCHEDULE_II_FITS)[number]
  function renderScheduleII(f: S2Fit) {
    const lh = f.lineHeight
    const para = (runs: Run[], x: number, w: number, justify = true) => {
      const ls = wrapRuns(runs, w, SIZE)
      ls.forEach((ws, i) => {
        if (y - lh < BOTTOM) newPage(group)
        y -= lh
        drawWords(ws, x, y, SIZE, justify && i < ls.length - 1 ? w : null)
      })
    }
    y -= lh
    centre(s2.title, y, SIZE, verdanaBold)
    y -= lh
    centre(s2.subtitle, y, SIZE, verdanaBold)
    y -= 6 * f.para
    para([{ text: s2.intro }], L, R - L)
    y -= 8 * f.para
    // LANDLORD ≈ 238 pt | TENANT = the rest (≈ 285 pt)
    const X2 = [L, L + 238, R]
    tableHeader(s2.table_header, X2, SIZE)
    const nRows = Math.max(s2.landlord_items.length, s2.tenant_items.length)
    for (let i = 0; i < nRows; i++) {
      // Each cell: "1. Item" then the note in brackets, indented.
      const cell = (it: string[] | undefined, w: number) => {
        if (!it) return [] as { ws: Word[]; dx: number }[]
        const [name, ...rest] = it
        return [
          ...wrapRuns([{ text: `${i + 1}. ${name}` }], w, SIZE).map((ws) => ({ ws, dx: 0 })),
          ...rest.flatMap((r) => wrapRuns([{ text: r }], w - 12, SIZE).map((ws) => ({ ws, dx: 12 }))),
        ]
      }
      const a = cell(s2.landlord_items[i], X2[1] - X2[0] - 2 * f.pad)
      const b = cell(s2.tenant_items[i], X2[2] - X2[1] - 2 * f.pad)
      const h = Math.max(a.length, b.length) * lh + 2 * f.pad
      if (y - h < BOTTOM) { newPage(group); tableHeader(s2.table_header, X2, SIZE) }
      const top = y
      a.forEach((c, j) => drawWords(c.ws, X2[0] + f.pad + c.dx, top - f.pad - SIZE - j * lh, SIZE, null))
      b.forEach((c, j) => drawWords(c.ws, X2[1] + f.pad + c.dx, top - f.pad - SIZE - j * lh, SIZE, null))
      y -= h
      X2.forEach((x) => vline(x, top, y))
      hline(X2[0], X2[2], y)
    }
    y -= 2 * f.para
    para([{ text: s2.table_note }], L, R - L, false)
    y -= 6 * f.para
    para([{ text: s2.termination_intro }], L, R - L)
    y -= 2 * f.para
    s2.termination_items.forEach((t, i) => {
      const ls = wrapRuns([{ text: t }], R - L - 22, SIZE)
      ls.forEach((ws, j) => {
        if (y - lh < BOTTOM) newPage(group)
        y -= lh
        if (j === 0) draw(`${i + 1}.`, L + 2, y)
        drawWords(ws, L + 22, y, SIZE, j < ls.length - 1 ? R - L - 22 : null)
      })
      y -= 2 * f.para
    })
    // Signature part: landlord names under the landlord title, tenant names under the tenant title.
    const half = (R - L) / 2
    const colW = half - 10
    y -= 14 * f.para + 6
    const startY = y
    let lowest = y
    const sigCol = (x: number, title: string, names: string[]) => {
      let yy = startY
      wrapRuns([{ text: title, bold: true }], colW, SIZE).forEach((ws) => { yy -= lh; drawWords(ws, x, yy, SIZE, null) })
      for (const name of names) {
        yy -= f.sigGap + lh
        draw(dotsFor(colW), x, yy)
        wrapRuns([{ text: `Name: ${name}` }], colW, SIZE).forEach((ws) => { yy -= f.step; drawWords(ws, x, yy, SIZE, null) })
        yy -= f.step
        draw('Date:', x, yy)
      }
      lowest = Math.min(lowest, yy)
    }
    sigCol(L, s2.landlordSignTitle, s2.landlordNames)
    sigCol(L + half + 10, s2.tenantSignTitle, s2.tenantNames)
    y = lowest
    if (y < BOTTOM) newPage(group)
  }
  const s2Group = (f: S2Fit): PageGroup => (f.margin === 30 ? 'scheduleTight' : 'schedule')
  const s2Fit = SCHEDULE_II_FITS.find((f) => {
    newPageMeasure(s2Group(f))
    return fitsOnPage(() => renderScheduleII(f))
  }) ?? null
  const s2Choice = s2Fit ?? SCHEDULE_II_FITS[SCHEDULE_II_FITS.length - 1]
  newPage(s2Group(s2Choice))
  renderScheduleII(s2Choice)

  /** Sets the page geometry of a group for measuring, without adding a page. */
  function newPageMeasure(g: PageGroup) {
    group = g
    L = PAGE_GROUPS[g].left
    R = PW - PAGE_GROUPS[g].right
    BOTTOM = bodyBottom(g)
    y = PH - PAGE_GROUPS[g].top
  }

  // ── Footers on every page except the cover: initial box (Arial 8) + page number (Arial 9) ──
  footerPages.forEach(({ page: p, group: g }, i) => {
    const G = PAGE_GROUPS[g]
    const label = String(i + 1)
    const cx = G.left + (PW - G.left - G.right) / 2
    p.drawText(label, { x: cx - arial.widthOfTextAtSize(label, PAGE_NO_SIZE) / 2, y: G.footer + 2.2, size: PAGE_NO_SIZE, font: arial, color: black })
    const [w1, w2] = G.box
    const rh = INITIAL_BOX.rowHeight
    const x0 = G.left + INITIAL_BOX.offsetFromLeftMargin
    const y0 = G.footer + PAGE_NO_LINE + 1
    const t = INITIAL_BOX.border
    p.drawRectangle({ x: x0, y: y0, width: w1 + w2, height: 2 * rh, borderColor: black, borderWidth: t })
    p.drawLine({ start: { x: x0 + w1, y: y0 }, end: { x: x0 + w1, y: y0 + 2 * rh }, thickness: t, color: black })
    p.drawLine({ start: { x: x0, y: y0 + rh }, end: { x: x0 + w1 + w2, y: y0 + rh }, thickness: t, color: black })
    ;[['Landlord', 0, w1], ['Tenant', w1, w2]].forEach(([text, dx, w]) => {
      const tw = arial.widthOfTextAtSize(text as string, INITIAL_BOX.fontSize)
      p.drawText(text as string, { x: x0 + (dx as number) + (w as number) / 2 - tw / 2, y: y0 + rh + 3.6, size: INITIAL_BOX.fontSize, font: arial, color: black })
    })
  })

  const layout: AgreementLayout = {
    signing: { ...signSpacing, onePage: signingOnePage },
    schedule: { ...schedChoice, onePage: !!schedFit },
    scheduleII: { ...s2Choice, onePage: !!s2Fit },
  }
  return { bytes: await doc.save(), layout }
}
