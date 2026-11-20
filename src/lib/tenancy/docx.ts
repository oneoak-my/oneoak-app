// Tenancy agreement → editable Word document (docx library; real paragraphs and tables, no images).
// Sections: cover (page border, centred), body (clauses + margin headings, footer with page number and
// Landlord | Tenant initial box), signing page, THE SCHEDULE, SCHEDULE II.

import type { Document as DocxDocument, Paragraph as DocxParagraph, Table as DocxTable, TextRun as DocxTextRun } from 'docx'
import type { AgreementModel, BodyItem, Line } from './model'
import type { RenderConfig } from './templates'

export async function buildAgreementDocx(model: AgreementModel, cfg: RenderConfig): Promise<DocxDocument> {
  const {
    Document, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, TableLayoutType,
    BorderStyle, Footer, PageNumber, VerticalAlign, VerticalAlignSection, PageBorderDisplay, PageBorderOffsetFrom,
    ShadingType, HeightRule, PageBreak, TabStopType,
  } = await import('docx')

  const FONT = 'Times New Roman'
  const SIZE = Math.round(cfg.bodySize * 2) // half-points
  const PAGE_W = 11906
  const MARGIN_L = 1280
  const MARGIN_R = 1000
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
  const dxa = (n: number) => ({ size: n, type: WidthType.DXA })

  const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
  const LINE = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
  const ALL_BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE }
  const CELL_NONE = { top: NONE, bottom: NONE, left: NONE, right: NONE }

  const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
    new TextRun({ text, font: FONT, size: o.size ?? SIZE, bold: o.bold, italics: o.italics })
  const runsOf = (line: Line, size?: number) => line.map((r) => run(r.text, { bold: r.bold, size }))
  const para = (children: DocxTextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {}) =>
    new Paragraph({ alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 0 }, children })

  // ── Cover ────────────────────────────────────────────────────────────────
  const c = model.cover
  const C = AlignmentType.CENTER
  const stars = '*'.repeat(38)
  const coverChildren: DocxParagraph[] = [
    para([run(c.date, { size: 24 })], { align: C, after: 600 }),
    para([run(stars, { size: 24 })], { align: C, after: 240 }),
    para([run('TENANCY AGREEMENT', { bold: true, size: 44 })], { align: C, after: 240 }),
    para([run(stars, { size: 24 })], { align: C, after: 700 }),
    ...c.premisesLines.map((l, i, a) => para([run(l, { bold: true, size: 24 })], { align: C, after: i === a.length - 1 ? 600 : 60 })),
    para([run('between', { italics: true, size: 24 })], { align: C, after: 400 }),
    ...c.landlords.flatMap((p) => [
      para([run(p.name, { bold: true, size: 24 })], { align: C, after: 40 }),
      para([run(p.idLine, { size: 22 })], { align: C, after: 240 }),
    ]),
    para([run('(the Landlord)', { size: 23 })], { align: C, after: 400 }),
    para([run('and', { italics: true, size: 24 })], { align: C, after: 400 }),
    ...c.tenants.flatMap((p) => [
      para([run(p.name, { bold: true, size: 24 })], { align: C, after: 40 }),
      para([run(p.idLine, { size: 22 })], { align: C, after: 240 }),
    ]),
    para([run('(the Tenant)', { size: 23 })], { align: C }),
  ]
  const THICK = { style: BorderStyle.THICK, size: 36, color: '000000', space: 24 }

  // ── Body: one borderless table, columns = number | sub-number | text | margin heading ──
  const COL_NO = 560
  const COL_SUB = 680
  const COL_MARGIN = Math.round(cfg.marginColumn * 20)
  const COL_GAP = 280
  const COL_TEXT = CONTENT_W - COL_NO - COL_SUB - COL_MARGIN
  const cell = (children: DocxParagraph[], width: number, span = 1) =>
    new TableCell({ width: dxa(width), columnSpan: span > 1 ? span : undefined, borders: CELL_NONE, margins: { left: 0, right: 0, top: 0, bottom: 0 }, children })
  const bodyPara = (text: string, o: { bold?: boolean; justify?: boolean } = {}) =>
    new Paragraph({
      alignment: o.justify === false ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
      spacing: { before: 0, after: 180, line: 264 },
      children: [run(text, { bold: o.bold })],
    })
  const marginParas = (item: BodyItem) =>
    item.margin.length
      ? item.margin.map((m) => new Paragraph({ spacing: { after: 60 }, children: [run(m, { bold: true, size: 17 })] }))
      : [new Paragraph({ children: [] })]

  const bodyRows = model.body.map((item) => {
    if (item.kind === 'heading') {
      return new TableRow({ cantSplit: true, children: [cell([bodyPara(item.text, { bold: true, justify: false })], COL_NO + COL_SUB + COL_TEXT, 3), cell([new Paragraph({ children: [] })], COL_MARGIN)] })
    }
    const marginCell = new TableCell({ width: dxa(COL_MARGIN), borders: CELL_NONE, margins: { left: COL_GAP, right: 0, top: 0, bottom: 0 }, children: marginParas(item) })
    if (!item.no) {
      return new TableRow({ children: [cell([bodyPara(item.text)], COL_NO + COL_SUB + COL_TEXT, 3), marginCell] })
    }
    if (item.level === 0) {
      return new TableRow({
        children: [
          cell([para([run(`${item.no}.`, { bold: true })])], COL_NO),
          cell([bodyPara(item.text)], COL_SUB + COL_TEXT, 2),
          marginCell,
        ],
      })
    }
    return new TableRow({
      children: [
        cell([new Paragraph({ children: [] })], COL_NO),
        cell([para([run(item.no)])], COL_SUB),
        cell([bodyPara(item.text)], COL_TEXT),
        marginCell,
      ],
    })
  })
  const bodyTable = new Table({
    width: dxa(CONTENT_W),
    columnWidths: [COL_NO, COL_SUB, COL_TEXT, COL_MARGIN],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: bodyRows,
  })

  const pageNumberPara = () =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 })] })
  const initialBox = new Table({
    alignment: AlignmentType.RIGHT,
    width: dxa(2320),
    columnWidths: [1160, 1160],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [
      new TableRow({ children: ['Landlord', 'Tenant'].map((t) => new TableCell({ width: dxa(1160), children: [para([run(t, { size: 16 })], { align: AlignmentType.CENTER })] })) }),
      new TableRow({ height: { value: 560, rule: HeightRule.EXACT }, children: [0, 1].map(() => new TableCell({ width: dxa(1160), children: [new Paragraph({ children: [] })] })) }),
    ],
  })
  const bodyFooter = new Footer({ children: [initialBox, pageNumberPara()] })
  const plainFooter = new Footer({ children: [pageNumberPara()] })

  // ── Signing ──────────────────────────────────────────────────────────────
  const SIG_L = 5200
  const SIG_B = 400
  const SIG_R = CONTENT_W - SIG_L - SIG_B
  const dots = '.'.repeat(55)
  const sigRow = (line: Line, dotted: boolean, bracket = true) =>
    new TableRow({
      cantSplit: true,
      children: [
        cell([para(runsOf(line), { after: 40 })], SIG_L),
        cell([para(bracket ? [run(')')] : [], { after: 40 })], SIG_B),
        cell([para(dotted ? [run(dots)] : [], { after: 40 })], SIG_R),
      ],
    })
  const signingChildren: (DocxParagraph | DocxTable)[] = [
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 480, line: 276 }, children: [run(model.testimonium)] }),
  ]
  for (const b of model.signing) {
    signingChildren.push(new Table({
      width: dxa(CONTENT_W),
      columnWidths: [SIG_L, SIG_B, SIG_R],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        sigRow([{ text: b.heading, bold: true }], false),
        ...b.signer.map((l, i) => sigRow(l, i === 0)),
        sigRow([], false, false),
        ...b.witness.map((l, i) => sigRow(l, i === 1)),
      ],
    }))
    signingChildren.push(new Paragraph({ spacing: { after: 360 }, children: [] }))
  }

  // ── THE SCHEDULE ─────────────────────────────────────────────────────────
  const S_NO = 1050, S_ITEM = 2900, S_PART = CONTENT_W - S_NO - S_ITEM
  const headCell = (t: string, w: number) =>
    new TableCell({
      width: dxa(w), verticalAlign: VerticalAlign.CENTER,
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E6E6E6' },
      children: [para([run(t, { bold: true, size: 19 })], { align: AlignmentType.CENTER, before: 60, after: 60 })],
    })
  const textCell = (paras: DocxParagraph[], w: number) =>
    new TableCell({ width: dxa(w), margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: paras })
  const scheduleTable = new Table({
    width: dxa(CONTENT_W),
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
  const HALF = Math.floor(CONTENT_W / 2)
  const itemCell = (it: string[] | undefined, n: number) => {
    if (!it) return textCell([new Paragraph({ children: [] })], HALF)
    const [name, ...rest] = it
    return textCell([
      para([run(`${n}. ${name}`, { size: 20 })]),
      ...rest.map((r) => new Paragraph({ indent: { left: 260 }, children: [run(r, { size: 18 })] })),
    ], HALF)
  }
  const nRows = Math.max(s2.landlord_items.length, s2.tenant_items.length)
  const s2Table = new Table({
    width: dxa(CONTENT_W),
    columnWidths: [HALF, CONTENT_W - HALF],
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
    width: dxa(CONTENT_W),
    columnWidths: [HALF, CONTENT_W - HALF],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          ['Signed by the Landlord in the presence of:', s2.landlordName],
          ['Confirmed by the Tenant in the presence of:', s2.tenantName],
        ].map(([heading, name]) => sigCell([
          para([run(heading, { bold: true, size: 20 })], { after: 720 }),
          para([run('.'.repeat(50), { size: 20 })], { after: 120 }),
          para([run(`Name: ${name}`, { size: 20 })], { after: 120 }),
          para([run('Date:', { size: 20 })]),
        ])),
      }),
    ],
  })
  const s2Para = (text: string, after = 160) =>
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after }, children: [run(text, { size: 20 })] })

  const scheduleChildren: (DocxParagraph | DocxTable)[] = [
    para([run(model.schedule.title, { bold: true, size: 26 })], { align: C, after: 60 }),
    para([run(model.schedule.subtitle, { italics: true, size: 19 })], { align: C, after: 240 }),
    scheduleTable,
    new Paragraph({ children: [new PageBreak()] }),
    para([run(s2.title, { bold: true, size: 26 })], { align: C, after: 80 }),
    para([run(s2.subtitle, { bold: true, size: 22 })], { align: C, after: 200 }),
    s2Para(s2.intro, 200),
    s2Table,
    para([run(s2.table_note, { italics: true, size: 18 })], { before: 80, after: 200 }),
    s2Para(s2.termination_intro, 100),
    ...s2.termination_items.map((t, i) => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 440, hanging: 440 },
      spacing: { after: 80 },
      children: [run(`${i + 1}.\t${t}`, { size: 20 })],
      tabStops: [{ type: TabStopType.LEFT, position: 440 }],
    })),
    new Paragraph({ spacing: { after: 600 }, children: [] }),
    s2Sign,
  ]

  const page = (extra: object = {}) => ({
    size: { width: PAGE_W, height: 16838 },
    margin: { top: 1300, bottom: 1500, left: MARGIN_L, right: MARGIN_R, footer: 500 },
    ...extra,
  })

  return new Document({
    title: model.fileStem,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            ...page(),
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
      { properties: { page: page({ pageNumbers: { start: 1 } }) }, footers: { default: bodyFooter }, children: [bodyTable] },
      { properties: { page: page() }, footers: { default: plainFooter }, children: signingChildren },
      { properties: { page: page() }, footers: { default: plainFooter }, children: scheduleChildren },
    ],
  })
}
