// Tenancy agreement → editable Word document (docx library; real paragraphs and tables, no images).
// Sections: cover (page border, centred), body (clauses + margin headings, footer with page number and
// Landlord | Tenant initial box), signing page, THE SCHEDULE, SCHEDULE II.

import type { Document as DocxDocument, Paragraph as DocxParagraph, Table as DocxTable, TextRun as DocxTextRun } from 'docx'
import type { AgreementModel, BodyItem, Line, Run } from './model'
import type { RenderConfig } from './templates'

export async function buildAgreementDocx(model: AgreementModel, cfg: RenderConfig): Promise<DocxDocument> {
  const {
    Document, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, TableLayoutType,
    BorderStyle, Footer, PageNumber, VerticalAlign, VerticalAlignSection, PageBorderDisplay, PageBorderOffsetFrom,
    ShadingType, HeightRule, PageBreak, TabStopType, LineRuleType,
  } = await import('docx')

  // Original template fonts: body Verdana 10, cover Calibri, margin headings / initial boxes / page number Arial.
  const FONT = 'Verdana'
  const CALIBRI = 'Calibri'
  const ARIAL = 'Arial'
  const SIZE = Math.round(cfg.bodySize * 2) // half-points
  const PAGE_W = 11906
  // Original template margins (twips): cover/clauses/signing, and the two schedule pages.
  const MAIN = { left: 1560, right: 1842, top: 1260, bottom: 432, footer: 288 }
  const SCHED = { left: 1800, right: 1800, top: 1170, bottom: 776, footer: 720 }
  const CONTENT_W = PAGE_W - MAIN.left - MAIN.right
  const CONTENT_S = PAGE_W - SCHED.left - SCHED.right
  const dxa = (n: number) => ({ size: n, type: WidthType.DXA })

  const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
  const LINE = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
  const ALL_BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE }
  const CELL_NONE = { top: NONE, bottom: NONE, left: NONE, right: NONE }

  const run = (text: string, o: { bold?: boolean; size?: number; font?: string } = {}) =>
    new TextRun({ text, font: o.font ?? FONT, size: o.size ?? SIZE, bold: o.bold })
  const runsOf = (line: Line, size?: number) => line.map((r) => run(r.text, { bold: r.bold, size }))
  const para = (children: DocxTextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; keepNext?: boolean } = {}) =>
    new Paragraph({ alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 0 }, keepNext: o.keepNext, children })

  // ── Cover ────────────────────────────────────────────────────────────────
  const c = model.cover
  const C = AlignmentType.CENTER
  const stars = '*'.repeat(38)
  const cal = (text: string, size: number, bold = false) => run(text, { font: CALIBRI, size, bold })
  const coverChildren: DocxParagraph[] = [
    para([run(c.date, { size: 30 })], { align: C, after: 480 }),
    para([cal(stars, 24)], { align: C, after: 200 }),
    para([cal('TENANCY AGREEMENT', 72, true)], { align: C, after: 200 }),
    para([cal(stars, 24)], { align: C, after: 600 }),
    ...c.premisesLines.map((l, i, a) => para([cal(l, 44, true)], { align: C, after: i === a.length - 1 ? 480 : 40 })),
    para([cal('between', 36)], { align: C, after: 360 }),
    ...c.landlords.flatMap((p) => [
      para([cal(p.name, 36, true)], { align: C, after: 0 }),
      para([cal(p.idLine, 32)], { align: C, after: 200 }),
    ]),
    para([cal('(the Landlord)', 36)], { align: C, after: 360 }),
    para([cal('and', 36)], { align: C, after: 360 }),
    ...c.tenants.flatMap((p) => [
      para([cal(p.name, 36, true)], { align: C, after: 0 }),
      para([cal(p.idLine, 32)], { align: C, after: 200 }),
    ]),
    para([cal('(the Tenant)', 36)], { align: C }),
  ]
  const THICK = { style: BorderStyle.THICK, size: 36, color: '000000', space: 24 }

  // ── Body: one borderless table from the left margin into the right page margin (original measurements):
  // number 78.1 pt | text 114.1–448.3 pt (justified) | gap | margin heading 512.4 pt, 66 pt wide (Arial 7).
  const pt = (n: number) => Math.round(n * 20)
  const B = cfg.body
  const LEFT_PT = MAIN.left / 20
  const COL_NUM = pt(B.textX - LEFT_PT)
  const COL_TEXT = pt(B.textRight - B.textX)
  const COL_GAP = pt(B.marginX - B.textRight)
  const COL_MARGIN = pt(B.marginWidth)
  const BODY_SPACING = { line: pt(B.lineHeight), lineRule: LineRuleType.EXACT }
  const cell = (children: DocxParagraph[], width: number, span = 1) =>
    new TableCell({ width: dxa(width), columnSpan: span > 1 ? span : undefined, borders: CELL_NONE, margins: { left: 0, right: 0, top: 0, bottom: 0 }, children })
  const bodyPara = (runs: Run[], o: { justify?: boolean } = {}) =>
    new Paragraph({
      alignment: o.justify === false ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
      spacing: { before: 0, after: 180, ...BODY_SPACING },
      children: runsOf(runs),
    })
  // First margin heading is nudged down so its baseline sits level with the clause's first line.
  const marginParas = (item: BodyItem) =>
    item.margin.length
      ? item.margin.map((m, i) => new Paragraph({ spacing: { before: i === 0 ? 70 : 0, after: 60 }, children: [run(m, { bold: true, size: 14, font: ARIAL })] }))
      : [new Paragraph({ children: [] })]
  const empty = () => cell([new Paragraph({ children: [] })], COL_GAP)

  const bodyRows = model.body.map((item) => {
    if (item.kind === 'heading') {
      return new TableRow({ cantSplit: true, children: [cell([bodyPara(item.runs, { justify: false })], COL_NUM + COL_TEXT, 2), empty(), cell([new Paragraph({ children: [] })], COL_MARGIN)] })
    }
    const marginCell = cell(marginParas(item), COL_MARGIN)
    if (!item.no) {
      return new TableRow({ children: [cell([bodyPara(item.runs)], COL_NUM + COL_TEXT, 2), empty(), marginCell] })
    }
    return new TableRow({
      children: [
        cell([new Paragraph({ spacing: BODY_SPACING, children: [run(item.level === 0 ? `${item.no}.` : item.no, { bold: item.level === 0 })] })], COL_NUM),
        cell([bodyPara(item.runs)], COL_TEXT),
        empty(),
        marginCell,
      ],
    })
  })
  const bodyTable = new Table({
    width: dxa(COL_NUM + COL_TEXT + COL_GAP + COL_MARGIN),
    columnWidths: [COL_NUM, COL_TEXT, COL_GAP, COL_MARGIN],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: bodyRows,
  })

  // Footer: "Landlord | Tenant" initial box (two rows ≥ 13.15 pt, 0.5 pt borders, Arial 8, left edge 320.4 pt
  // from the left margin) above the page number (Arial 9, centred).
  const pageNumberPara = () =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: ARIAL, size: 18 })] })
  const BOX_LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  const initialBox = (widths: [number, number]) => new Table({
    indent: dxa(6408),
    width: dxa(widths[0] + widths[1]),
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: BOX_LINE, bottom: BOX_LINE, left: BOX_LINE, right: BOX_LINE, insideHorizontal: BOX_LINE, insideVertical: BOX_LINE },
    margins: { left: 108, right: 108, top: 0, bottom: 0 },
    rows: [
      new TableRow({
        height: { value: 263, rule: HeightRule.ATLEAST },
        children: ['Landlord', 'Tenant'].map((t, i) => new TableCell({ width: dxa(widths[i]), verticalAlign: VerticalAlign.CENTER, children: [para([run(t, { size: 16, font: ARIAL })], { align: AlignmentType.CENTER })] })),
      }),
      new TableRow({
        height: { value: 263, rule: HeightRule.ATLEAST },
        children: widths.map((w) => new TableCell({ width: dxa(w), children: [para([run('', { size: 16, font: ARIAL })])] })),
      }),
    ],
  })
  const mainFooter = new Footer({ children: [initialBox([1147, 1166]), pageNumberPara()] })
  const scheduleFooter = new Footer({ children: [initialBox([1067, 1048]), pageNumberPara()] })

  // ── Signing ──────────────────────────────────────────────────────────────
  const SIG_L = 5200
  const SIG_B = 400
  const SIG_R = CONTENT_W - SIG_L - SIG_B
  const dots = '.'.repeat(38)
  // keepNext on every row but the last keeps each side's block on one page.
  const sigRow = (line: Line, dotted: boolean, bracket = true, keepNext = true) =>
    new TableRow({
      cantSplit: true,
      children: [
        cell([para(runsOf(line), { after: 40, keepNext })], SIG_L),
        cell([para(bracket ? [run(')')] : [], { after: 40, keepNext })], SIG_B),
        cell([para(dotted ? [run(dots)] : [], { after: 40, keepNext })], SIG_R),
      ],
    })
  const signingChildren: (DocxParagraph | DocxTable)[] = [
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 480, line: 276 }, children: [run(model.testimonium)] }),
  ]
  for (const side of model.signing) {
    const rows = [
      sigRow([{ text: side.heading, bold: true }], false),
      ...side.signers.flatMap((lines, si) => [
        ...(si > 0 ? [sigRow([], false, false)] : []),
        ...lines.map((l, i) => sigRow(l, i === 0)),
      ]),
      sigRow([], false, false),
      ...side.witness.map((l, i) => sigRow(l, i === 1, true, i < side.witness.length - 1)),
    ]
    signingChildren.push(new Table({
      width: dxa(CONTENT_W),
      columnWidths: [SIG_L, SIG_B, SIG_R],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows,
    }))
    signingChildren.push(new Paragraph({ spacing: { after: 360 }, children: [] }))
  }

  // ── THE SCHEDULE ─────────────────────────────────────────────────────────
  const S_NO = 1160, S_ITEM = 2840, S_PART = CONTENT_S - S_NO - S_ITEM
  const headCell = (t: string, w: number) =>
    new TableCell({
      width: dxa(w), verticalAlign: VerticalAlign.CENTER,
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E6E6E6' },
      children: [para([run(t, { bold: true })], { align: AlignmentType.CENTER, before: 60, after: 60 })],
    })
  const textCell = (paras: DocxParagraph[], w: number) =>
    new TableCell({ width: dxa(w), margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: paras })
  const scheduleTable = new Table({
    width: dxa(CONTENT_S),
    columnWidths: [S_NO, S_ITEM, S_PART],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: model.schedule.columns.map((col, i) => headCell(col, [S_NO, S_ITEM, S_PART][i])) }),
      ...model.schedule.rows.map((r) => new TableRow({
        cantSplit: true,
        children: [
          textCell([para([run(r.no)])], S_NO),
          textCell([para([run(r.item)])], S_ITEM),
          textCell(r.lines.map((l) => para(runsOf(l))), S_PART),
        ],
      })),
    ],
  })

  // ── SCHEDULE II ──────────────────────────────────────────────────────────
  const s2 = model.scheduleII
  const HALF = Math.floor(CONTENT_S / 2)
  const itemCell = (it: string[] | undefined, n: number) => {
    if (!it) return textCell([new Paragraph({ children: [] })], HALF)
    const [name, ...rest] = it
    return textCell([
      para([run(`${n}. ${name}`)]),
      ...rest.map((r) => new Paragraph({ indent: { left: 260 }, children: [run(r)] })),
    ], HALF)
  }
  const nRows = Math.max(s2.landlord_items.length, s2.tenant_items.length)
  const s2Table = new Table({
    width: dxa(CONTENT_S),
    columnWidths: [HALF, CONTENT_S - HALF],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: s2.table_header.map((h) => headCell(h, HALF)) }),
      ...Array.from({ length: nRows }, (_, i) => new TableRow({
        cantSplit: true,
        children: [itemCell(s2.landlord_items[i], i + 1), itemCell(s2.tenant_items[i], i + 1)],
      })),
    ],
  })
  const sigCell = (paras: DocxParagraph[]) => new TableCell({ width: dxa(HALF), borders: CELL_NONE, children: paras })
  const s2Sign = new Table({
    width: dxa(CONTENT_S),
    columnWidths: [HALF, CONTENT_S - HALF],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        // Landlord names under the landlord heading, tenant names under the tenant heading (one block each).
        children: ([
          ['Signed by the Landlord in the presence of:', s2.landlordNames],
          ['Confirmed by the Tenant in the presence of:', s2.tenantNames],
        ] as [string, string[]][]).map(([heading, names]) => sigCell([
          para([run(heading, { bold: true })]),
          ...names.flatMap((name) => [
            para([run('.'.repeat(40))], { before: 640, after: 120 }),
            para([run(`Name: ${name}`)], { after: 120 }),
            para([run('Date:')]),
          ]),
        ])),
      }),
    ],
  })
  const s2Para = (text: string, after = 160) =>
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after }, children: [run(text)] })

  const scheduleChildren: (DocxParagraph | DocxTable)[] = [
    para([run(model.schedule.title, { bold: true })], { align: C, after: 60 }),
    para([run(model.schedule.subtitle)], { align: C, after: 240 }),
    scheduleTable,
    new Paragraph({ children: [new PageBreak()] }),
    para([run(s2.title, { bold: true })], { align: C, after: 80 }),
    para([run(s2.subtitle, { bold: true })], { align: C, after: 200 }),
    s2Para(s2.intro, 200),
    s2Table,
    para([run(s2.table_note)], { before: 80, after: 200 }),
    s2Para(s2.termination_intro, 100),
    ...s2.termination_items.map((t, i) => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 440, hanging: 440 },
      spacing: { after: 80 },
      children: [run(`${i + 1}.\t${t}`)],
      tabStops: [{ type: TabStopType.LEFT, position: 440 }],
    })),
    new Paragraph({ spacing: { after: 600 }, children: [] }),
    s2Sign,
  ]

  const pageOf = (m: typeof MAIN, extra: object = {}) => ({
    size: { width: PAGE_W, height: 16838 },
    margin: { top: m.top, bottom: m.bottom, left: m.left, right: m.right, footer: m.footer, header: 720 },
    ...extra,
  })

  return new Document({
    title: model.fileStem,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            ...pageOf(MAIN),
            borders: {
              pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE },
              pageBorderTop: THICK, pageBorderBottom: THICK, pageBorderLeft: THICK, pageBorderRight: THICK,
            },
          },
          verticalAlign: VerticalAlignSection.CENTER,
        },
        footers: { default: new Footer({ children: [new Paragraph({ children: [] })] }) },
        children: coverChildren,
      },
      { properties: { page: pageOf(MAIN, { pageNumbers: { start: 1 } }) }, footers: { default: mainFooter }, children: [bodyTable] },
      { properties: { page: pageOf(MAIN) }, footers: { default: mainFooter }, children: signingChildren },
      { properties: { page: pageOf(SCHED) }, footers: { default: scheduleFooter }, children: scheduleChildren },
    ],
  })
}
