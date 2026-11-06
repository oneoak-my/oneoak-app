import type { Inventory, AreaData, CustomItemSelection } from './inventoryTypes'
import { ALL_ITEMS, renderItemLabel, renderItemQty, renderItemCheckInNote } from './inventoryCatalog'
import type { CatalogItem } from './inventoryCatalog'

// ── Helpers ──────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function getFileStem(inv: Inventory): string {
  const unit = inv.heading?.split(/[,\s]/)[0]?.trim() ?? 'inventory'
  const date = inv.inventory_date ?? new Date().toISOString().split('T')[0]
  return `${unit}-inventory-list-${date}`
}

function getShortAddr(inv: Inventory): string {
  if (inv.short_address?.trim()) return inv.short_address.trim()
  return inv.heading?.split(',')[0]?.trim() ?? ''
}

interface RowData {
  label: string
  qty: string
  checkIn: string
}

function getRowData(sel: CustomItemSelection): RowData {
  if (sel.itemId === 'custom') {
    return { label: sel.customLabel ?? 'Item', qty: String(sel.qty), checkIn: '' }
  }
  const item = ALL_ITEMS[sel.itemId] as CatalogItem | undefined
  if (!item) return { label: sel.itemId, qty: String(sel.qty), checkIn: '' }
  return {
    label: renderItemLabel(item, sel),
    qty: renderItemQty(item, sel),
    checkIn: renderItemCheckInNote(item, sel),
  }
}

/** Areas that have at least one ticked item */
function areasWithItems(inventory: Inventory): AreaData[] {
  return inventory.areas.filter((a) => a.items.length > 0)
}

// ── WORD EXPORT ───────────────────────────────────────────────────────────────

const BORDER = { style: 'single' as const, size: 4, color: '000000' }
const NO_BORDER = { style: 'none' as const, size: 0, color: 'FFFFFF' }
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }

const COL_WIDTHS = [675, 4755, 960, 1965, 1560] as const
const TABLE_WIDTH = 9915
const TABLE_INDENT = -476
const ROW_HEIGHT = 302
const VERDANA = 'Verdana'
const ARIAL = 'Arial'
const BODY_SIZE = 18 // 9pt in half-points
const FOOTER_SIZE = 16 // 8pt in half-points
const LETTER_CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function letter(i: number) { return (LETTER_CODES[i] ?? String(i + 1)) + '.' }

export async function downloadWord(inventory: Inventory): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, TableLayoutType,
    HeightRule, VerticalAlign, Footer, PageNumber, TabStopType,
  } = await import('docx')

  const twips = (n: number) => ({ size: n, type: WidthType.DXA })
  const shortAddr = getShortAddr(inventory)

  // ── Cell factory ────────────────────────────────────────────────────────────
  function makeCell(
    text: string,
    opts: {
      bold?: boolean
      centered?: boolean
      colIndex?: number
      colSpan?: number
      italic?: boolean
    } = {},
  ) {
    const idx = opts.colIndex ?? 0
    return new TableCell({
      width: twips(COL_WIDTHS[idx] ?? 960),
      columnSpan: opts.colSpan,
      verticalAlign: VerticalAlign.CENTER,
      borders: CELL_BORDERS,
      children: [
        new Paragraph({
          alignment: opts.centered ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 0, after: 0 },
          children: [
            new TextRun({
              text,
              font: VERDANA,
              size: BODY_SIZE,
              bold: opts.bold,
              italics: opts.italic,
            }),
          ],
        }),
      ],
    })
  }

  function emptyCell(colIndex: number) {
    return makeCell('', { colIndex })
  }

  function makeRow(
    cells: ReturnType<typeof makeCell>[],
    opts: { cantSplit?: boolean; tableHeader?: boolean } = {},
  ) {
    return new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      cantSplit: opts.cantSplit !== false,
      tableHeader: opts.tableHeader,
      children: cells,
    })
  }

  // ── Build table rows ─────────────────────────────────────────────────────────
  const tableRows: ReturnType<typeof makeRow>[] = []

  // Header (repeats on every page via tableHeader: true)
  tableRows.push(makeRow([
    emptyCell(0),
    makeCell('DESCRIPTION', { bold: true, centered: true, colIndex: 1 }),
    makeCell('UNIT', { bold: true, centered: true, colIndex: 2 }),
    makeCell('CHECK IN', { bold: true, centered: true, colIndex: 3 }),
    makeCell('CHECK OUT', { bold: true, centered: true, colIndex: 4 }),
  ], { tableHeader: true }))

  const printAreas = areasWithItems(inventory)

  printAreas.forEach((area, areaIdx) => {
    // Area header row
    tableRows.push(makeRow([
      makeCell(letter(areaIdx), { bold: true, centered: true, colIndex: 0 }),
      new TableCell({
        width: twips(COL_WIDTHS[1] + COL_WIDTHS[2]),
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        borders: CELL_BORDERS,
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: area.title.toUpperCase(), font: VERDANA, size: BODY_SIZE, bold: true })],
          }),
        ],
      }),
      emptyCell(3),
      emptyCell(4),
    ]))

    // Item rows
    area.items.forEach((sel, itemIdx) => {
      const { label, qty, checkIn } = getRowData(sel)
      tableRows.push(makeRow([
        makeCell(`${itemIdx + 1}.`, { centered: true, colIndex: 0 }),
        makeCell(label, { colIndex: 1 }),
        makeCell(qty, { centered: true, colIndex: 2 }),
        makeCell(checkIn, { colIndex: 3 }),
        emptyCell(4),
      ]))
    })

    // Blank spacer row
    tableRows.push(makeRow([
      emptyCell(0), emptyCell(1), emptyCell(2), emptyCell(3), emptyCell(4),
    ]))
  })

  // Meter reading section
  if (inventory.include_meter_reading) {
    tableRows.push(makeRow([
      emptyCell(0),
      new TableCell({
        width: twips(COL_WIDTHS[1] + COL_WIDTHS[2]),
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        borders: CELL_BORDERS,
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: 'METER READING', font: VERDANA, size: BODY_SIZE, bold: true })],
          }),
        ],
      }),
      emptyCell(3),
      emptyCell(4),
    ]))
    for (const label of ['Water', 'Electricity']) {
      tableRows.push(makeRow([
        emptyCell(0),
        makeCell(label, { colIndex: 1 }),
        emptyCell(2), emptyCell(3), emptyCell(4),
      ]))
    }
  }

  // ── Closing block ─────────────────────────────────────────────────────────
  const sigCell = (text: string) =>
    new TableCell({
      width: twips(4500),
      borders: NO_BORDERS,
      children: [
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text, font: VERDANA, size: BODY_SIZE })],
        }),
      ],
    })

  function sigRow(left: string, right: string) {
    return new TableRow({
      cantSplit: true,
      children: [sigCell(left), sigCell(right)],
    })
  }

  const closingTable = new Table({
    width: twips(9000),
    layout: TableLayoutType.FIXED,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      sigRow('Confirmed by Landlord/in the presence of,', 'Confirmed by Tenant/in the presence of,'),
      new TableRow({
        cantSplit: true,
        height: { value: 600, rule: HeightRule.ATLEAST },
        children: [sigCell(''), sigCell('')],
      }),
      sigRow('______________________', '______________________'),
      sigRow('Name:', 'Name:'),
      sigRow('Date:', 'Date:'),
    ],
  })

  // ── Main table ────────────────────────────────────────────────────────────
  const mainTable = new Table({
    width: twips(TABLE_WIDTH),
    indent: twips(TABLE_INDENT),
    layout: TableLayoutType.FIXED,
    borders: {
      top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
      insideHorizontal: BORDER, insideVertical: BORDER,
    },
    rows: tableRows,
  })

  // ── Title paragraphs ───────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: 'INVENTORY LIST', font: ARIAL, size: 28, bold: true })],
  })

  const headingText = `FOR ${inventory.heading ?? ''}`
  const headingPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: headingText, font: ARIAL, size: 22 })],
  })

  // 36pt gap before closing block
  const gapPara = new Paragraph({
    text: '',
    spacing: { after: 720 },
  })

  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 8738 }],
        children: [
          new TextRun({ text: `${shortAddr} | Inventory list\t`, font: VERDANA, size: FOOTER_SIZE }),
          new TextRun({ children: [PageNumber.CURRENT], font: VERDANA, size: FOOTER_SIZE }),
        ],
      }),
    ],
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1118, bottom: 720, left: 1728, right: 1440 },
          },
        },
        footers: { default: footer },
        children: [titlePara, headingPara, mainTable, gapPara, closingTable],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${getFileStem(inventory)}.docx`)
}

// ── PDF EXPORT ────────────────────────────────────────────────────────────────

const PT = 1
const PAGE_W = 595.28 * PT
const PAGE_H = 841.89 * PT
const ML = 86.4 * PT  // left margin (1728 twips)
const MR = 72 * PT    // right margin (1440 twips)
const MT = 55.9 * PT  // top margin (1118 twips)
const MB = 36 * PT    // bottom margin (720 twips)
const CONTENT_W = PAGE_W - ML - MR

// Column proportions from twip widths
const COL_RATIOS = COL_WIDTHS.map((w) => w / TABLE_WIDTH)
const PDF_COLS = COL_RATIOS.map((r) => r * CONTENT_W)
const COL_X = PDF_COLS.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? ML : acc[i - 1]! + PDF_COLS[i - 1]!)
  return acc
}, [])

const FONT_SIZE_BODY = 8.5
const FONT_SIZE_TITLE = 14
const FONT_SIZE_HEAD = 11
const FONT_SIZE_FOOTER = 8
const ROW_H = 18 * PT
const LINE_H = FONT_SIZE_BODY + 3
const FOOTER_H = 20

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

export async function downloadPdf(inventory: Inventory): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()

  const regFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0, 0, 0)
  const shortAddr = getShortAddr(inventory)

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let pageNum = 1
  let y = PAGE_H - MT

  function drawFooter(pg: import('pdf-lib').PDFPage, pn: number) {
    const footerText = `${shortAddr} | Inventory list`
    pg.drawText(footerText, { x: ML, y: MB / 2, size: FONT_SIZE_FOOTER, font: regFont, color: ink })
    const numText = String(pn)
    const numW = regFont.widthOfTextAtSize(numText, FONT_SIZE_FOOTER)
    pg.drawText(numText, { x: PAGE_W - MR - numW, y: MB / 2, size: FONT_SIZE_FOOTER, font: regFont, color: ink })
  }

  function drawText(text: string, x: number, cy: number, bold: boolean, size = FONT_SIZE_BODY) {
    page.drawText(text, { x, y: cy, size, font: bold ? boldFont : regFont, color: ink })
  }

  function drawCellBorder(cx: number, cy: number, cw: number, ch: number) {
    page.drawRectangle({ x: cx, y: cy - ch, width: cw, height: ch, borderColor: ink, borderWidth: 0.5, color: undefined })
  }

  function drawRow(
    cells: { text: string; bold?: boolean; centered?: boolean; colStart: number; colEnd?: number }[],
    rowH: number,
  ) {
    ensureY(rowH)
    // draw borders
    let xCursor = ML
    for (let ci = 0; ci < 5; ci++) {
      drawCellBorder(xCursor, y, PDF_COLS[ci]!, rowH)
      xCursor += PDF_COLS[ci]!
    }
    // draw text
    for (const cell of cells) {
      const start = cell.colStart
      const end = cell.colEnd ?? start
      const cellX = COL_X[start]!
      const cellW = PDF_COLS.slice(start, end + 1).reduce((s, v) => s + v, 0)
      const pad = 3
      const textX = cell.centered
        ? cellX + cellW / 2 - (cell.bold ? boldFont : regFont).widthOfTextAtSize(cell.text, FONT_SIZE_BODY) / 2
        : cellX + pad
      drawText(cell.text, textX, y - rowH / 2 - FONT_SIZE_BODY * 0.35, cell.bold ?? false)
    }
    y -= rowH
  }

  function drawHeaderRow() {
    drawRow([
      { text: 'DESCRIPTION', bold: true, centered: true, colStart: 1 },
      { text: 'UNIT', bold: true, centered: true, colStart: 2 },
      { text: 'CHECK IN', bold: true, centered: true, colStart: 3 },
      { text: 'CHECK OUT', bold: true, centered: true, colStart: 4 },
    ], ROW_H)
  }

  function newPage() {
    drawFooter(page, pageNum)
    page = pdfDoc.addPage([PAGE_W, PAGE_H])
    pageNum++
    y = PAGE_H - MT
    drawHeaderRow()
  }

  function ensureY(needed: number) {
    if (y - needed < MB + FOOTER_H) newPage()
  }

  // ── Title block ──────────────────────────────────────────────────────────
  const titleText = 'INVENTORY LIST'
  const titleW = boldFont.widthOfTextAtSize(titleText, FONT_SIZE_TITLE)
  ensureY(FONT_SIZE_TITLE + 8)
  drawText(titleText, PAGE_W / 2 - titleW / 2, y, true, FONT_SIZE_TITLE)
  y -= FONT_SIZE_TITLE + 8

  const headingText = `FOR ${inventory.heading ?? ''}`
  const headingLines = wrapText(headingText, regFont, FONT_SIZE_HEAD, CONTENT_W)
  for (const line of headingLines) {
    ensureY(FONT_SIZE_HEAD + 6)
    const lw = regFont.widthOfTextAtSize(line, FONT_SIZE_HEAD)
    drawText(line, PAGE_W / 2 - lw / 2, y, false, FONT_SIZE_HEAD)
    y -= FONT_SIZE_HEAD + 4
  }
  y -= 8

  // ── Header row ────────────────────────────────────────────────────────────
  drawHeaderRow()

  const printAreas = areasWithItems(inventory)

  printAreas.forEach((area, areaIdx) => {
    // Orphan prevention: ensure space for area header + first item row
    if (area.items.length > 0 && y - ROW_H * 2 < MB + FOOTER_H) newPage()

    // area header row
    drawRow([
      { text: letter(areaIdx), bold: true, centered: true, colStart: 0 },
      { text: area.title.toUpperCase(), bold: true, colStart: 1, colEnd: 2 },
    ], ROW_H)

    area.items.forEach((sel, itemIdx) => {
      const { label, qty, checkIn } = getRowData(sel)
      const descLines = wrapText(label, regFont, FONT_SIZE_BODY, PDF_COLS[1]! - 6)
      const rh = Math.max(ROW_H, descLines.length * LINE_H + 6)
      ensureY(rh)
      // borders
      let xc = ML
      for (let ci = 0; ci < 5; ci++) { drawCellBorder(xc, y, PDF_COLS[ci]!, rh); xc += PDF_COLS[ci]! }
      // number (vertically centred)
      const numTxt = `${itemIdx + 1}.`
      const numW = regFont.widthOfTextAtSize(numTxt, FONT_SIZE_BODY)
      drawText(numTxt, COL_X[0]! + PDF_COLS[0]! / 2 - numW / 2, y - rh / 2 - FONT_SIZE_BODY * 0.35, false)
      // description (wrapped, vertically centred as a block)
      const textBlockH = descLines.length * LINE_H
      const firstLineY = (y - rh / 2) + textBlockH / 2 - FONT_SIZE_BODY * 0.7
      descLines.forEach((line, li) => {
        drawText(line, COL_X[1]! + 3, firstLineY - li * LINE_H, false)
      })
      // qty (vertically centred)
      const qW = regFont.widthOfTextAtSize(qty, FONT_SIZE_BODY)
      drawText(qty, COL_X[2]! + PDF_COLS[2]! / 2 - qW / 2, y - rh / 2 - FONT_SIZE_BODY * 0.35, false)
      // check in (vertically centred)
      if (checkIn) drawText(checkIn, COL_X[3]! + 3, y - rh / 2 - FONT_SIZE_BODY * 0.35, false)
      y -= rh
    })

    // blank spacer
    drawRow([], ROW_H)
  })

  // Meter reading
  if (inventory.include_meter_reading) {
    drawRow([
      { text: 'METER READING', bold: true, colStart: 1, colEnd: 2 },
    ], ROW_H)
    for (const label of ['Water', 'Electricity']) {
      drawRow([{ text: label, colStart: 1 }], ROW_H)
    }
  }

  // ── Closing block ─────────────────────────────────────────────────────────
  const sigBlockH = 36 + (FONT_SIZE_BODY + 8) + 30 + 3 * (FONT_SIZE_BODY + 8) + 10
  ensureY(sigBlockH)
  y -= 36
  const halfW = CONTENT_W / 2

  drawText('Confirmed by Landlord/in the presence of,', ML, y, false)
  drawText('Confirmed by Tenant/in the presence of,', ML + halfW, y, false)
  y -= FONT_SIZE_BODY + 8 + 30

  for (const [left, right] of [
    ['______________________', '______________________'],
    ['Name:', 'Name:'],
    ['Date:', 'Date:'],
  ] as [string, string][]) {
    drawText(left, ML, y, false)
    drawText(right, ML + halfW, y, false)
    y -= FONT_SIZE_BODY + 8
  }

  drawFooter(page, pageNum)

  const bytes = await pdfDoc.save()
  downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), `${getFileStem(inventory)}.pdf`)
}
