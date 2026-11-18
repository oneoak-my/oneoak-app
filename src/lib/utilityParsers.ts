// Rule-based parsers for utility PDFs, run in the browser on the text lines from
// pdfText.ts. Free: no AI, no server. Dates DD/MM/YYYY or "01 Oct 2026",
// amounts like 1,234.56. Anything not found is left null and shown as an
// editable field with a warning; parsing never throws.

import { emptyDoc, type UtilityDoc, type UtilityDocType } from './utilityDocs'

export type ParseResult = { doc: UtilityDoc; warnings: string[] }

// ── Token helpers ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "05/10/2026" → "2026-10-05". */
export function dmy(s: string | undefined | null): string | null {
  const m = s?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${m[3]}-${pad(mo)}-${pad(d)}`
}

/** "01 Oct 2026" / "1 October 2026" → "2026-10-01". */
export function dMonY(s: string | undefined | null): string | null {
  const m = s?.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)]
  const d = Number(m[1])
  if (!mo || d < 1 || d > 31) return null
  return `${m[3]}-${pad(mo)}-${pad(d)}`
}

/** "1,234.56", "(1.05)", "-0.75", "0.75-", "RM12.00" → number; otherwise null. */
export function parseNum(token: string | undefined | null): number | null {
  if (!token) return null
  let t = token.trim().replace(/^RM/i, '').trim()
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (t.startsWith('-')) { neg = true; t = t.slice(1) }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1) }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

/** Money tokens (exactly 2 decimals) in order. Token-based on purpose: no regex lookbehind (older iOS Safari). */
export function amountsIn(text: string): number[] {
  const out: number[] = []
  for (const tok of text.split(/\s+/)) {
    const t = tok.replace(/^RM/i, '')
    if (!/^\(?-?[\d,]*\d\.\d{2}\)?-?$/.test(t)) continue
    const n = parseNum(t)
    if (n != null) out.push(n)
  }
  return out
}

/** Any numeric tokens (rates with 4 decimals, readings, kWh). */
function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const tok of text.split(/\s+/)) {
    const n = parseNum(tok)
    if (n != null) out.push(n)
  }
  return out
}

const UNIT_RE = /\b[A-Z]{1,2}\d{0,2}-\d{1,3}[A-Z]?-\d{1,3}[A-Z]?\b/i

function firstMatch(lines: string[], re: RegExp): RegExpMatchArray | null {
  for (const l of lines) {
    const m = l.match(re)
    if (m) return m
  }
  return null
}

/** Value after a label: on the same line, else the first amount on the next line. */
function labelAmount(lines: string[], label: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label)
    if (!m || m.index == null) continue
    const after = lines[i].slice(m.index + m[0].length)
    const same = amountsIn(after)
    if (same.length) return same[0]
  }
  return null
}

const cents = (n: number) => Math.round(n * 100)

// ── Classification ────────────────────────────────────────────────────────────

export function classify(lines: string[]): UtilityDocType {
  const t = lines.join('\n').toUpperCase()
  if (t.includes('YNH UTILITY')) {
    if (t.includes('STATEMENT AS AT')) return 'ynh_statement'
    if (t.includes('INVOICE') && (t.includes('CONSUMPTION CHARGES') || t.includes('PAYABLE AMOUNT'))) return 'ynh_invoice'
  }
  if (t.includes('TOTAL RECORD') && t.includes('OUTSTANDING') && t.includes('INVOICE NO')) return 'water_statement'
  if (t.includes('PERBADANAN PENGURUSAN') && t.includes('OUTSTANDING') && t.includes('INVOICE NO') && !t.includes('PREVIOUS READING')) {
    return 'water_statement'
  }
  if (t.includes('WATER METER RECEIVABLES') || (t.includes('PREVIOUS READING') && t.includes('CURRENT READING'))) {
    return 'water_invoice'
  }
  return 'unknown'
}

// ── Water statement (management office) ──────────────────────────────────────

const STMT_ROW = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\S+)\s+(.*?)(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*(.*)$/
const STARTS_WITH_DATE = /^\d{1,2}\/\d{1,2}\/\d{4}\b/

export function parseWaterStatement(lines: string[]): ParseResult {
  const doc = emptyDoc('water_statement') as Extract<UtilityDoc, { type: 'water_statement' }>
  const warnings: string[] = []
  const d = doc.data

  d.unitNo = firstMatch(lines, /From Unit\s+(\S+)\s+To\s+\S+/i)?.[1] ?? null
  d.statementDate = dmy(firstMatch(lines, /\bDATE\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1])

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(STMT_ROW)
    if (!m) continue
    let rest = m[6]
    // Amounts can wrap onto the next line when the name column is long.
    for (let j = i + 1; amountsIn(rest).length < 5 && j < Math.min(lines.length, i + 3); j++) {
      if (STARTS_WITH_DATE.test(lines[j]) || /^Total Record/i.test(lines[j])) break
      rest += ' ' + lines[j]
    }
    const n = amountsIn(rest)
    const periodStart = dmy(m[4])
    const periodEnd = dmy(m[5])
    if (n.length < 5 || !periodStart || !periodEnd) {
      warnings.push(`Statement row ${m[2]} could not be fully read: add it in the rows table`)
      continue
    }
    // Amount | Tax | Amount Paid | Tax Paid | Outstanding | Outstanding Tax ...
    d.rows.push({
      invoiceDate: dmy(m[1]),
      invoiceNo: m[2],
      periodStart,
      periodEnd,
      amount: n[0],
      paid: n[2],
      outstanding: n[4],
    })
  }

  const totalLine = firstMatch(lines, /Total Record\(?s?\)?\s*:?\s*(\d+)\s*(.*)$/i)
  if (totalLine) {
    const count = Number(totalLine[1])
    const t = amountsIn(totalLine[2])
    d.printedTotal = t.length >= 5 ? t[4] : t.length ? t[t.length - 1] : null
    if (count !== d.rows.length) {
      warnings.push(`Statement says ${count} records but ${d.rows.length} rows were read: check the rows table`)
    }
  } else {
    warnings.push('Statement total line ("Total Record(s)") not found: rows cannot be cross-checked')
  }
  if (d.printedTotal != null && d.rows.length) {
    const sum = d.rows.reduce((s, r) => s + cents(r.outstanding), 0)
    if (sum !== cents(d.printedTotal)) {
      warnings.push(`Rows add up to RM ${(sum / 100).toFixed(2)} but the printed outstanding total is RM ${d.printedTotal.toFixed(2)}`)
    }
  }
  if (!d.rows.length) warnings.push('No statement rows found: type them in the rows table')
  return { doc, warnings }
}

// ── Water invoice (management office) ────────────────────────────────────────

export function parseWaterInvoice(lines: string[]): ParseResult {
  const doc = emptyDoc('water_invoice') as Extract<UtilityDoc, { type: 'water_invoice' }>
  const warnings: string[] = []
  const d = doc.data

  d.invoiceNo = firstMatch(lines, /Invoice No\.?\s*:\s*(\S+)/i)?.[1] ?? null
  d.invoiceDate = dmy(firstMatch(lines, /Invoice Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1])

  // Unit: on the "Property Unit" line, or the line after it.
  for (let i = 0; i < lines.length && !d.unitNo; i++) {
    const m = lines[i].match(/Property Unit\s*:?\s*(.*)$/i)
    if (!m) continue
    d.unitNo = m[1].match(UNIT_RE)?.[0] ?? lines[i + 1]?.match(UNIT_RE)?.[0] ?? null
  }

  const item = lines.find((l) => /WATER METER RECEIVABLES/i.test(l))
  if (item) {
    const after = item.split(/WATER METER RECEIVABLES/i)[1] ?? ''
    const dates = after.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? []
    d.periodStart = dmy(dates[0])
    d.periodEnd = dmy(dates[1])
    const n = amountsIn(after)
    if (n.length) d.total = n[n.length - 1]
  }
  const totalAmount = labelAmount(lines, /Total Amount\s*:?\s*/i)
  if (d.total == null) d.total = totalAmount

  const reading = (re: RegExp) => {
    const m = firstMatch(lines, re)
    return m ? parseNum(m[1]) : null
  }
  d.previousReading = reading(/Previous reading\s*:?\s*([\d,]+(?:\.\d+)?)/i)
  d.currentReading = reading(/Current reading\s*:?\s*([\d,]+(?:\.\d+)?)/i)
  d.consumedUnits = reading(/Total consumed units\s*:?\s*([\d,]+(?:\.\d+)?)/i)

  if (d.previousReading != null && d.currentReading != null && d.consumedUnits != null &&
      Math.abs(d.currentReading - d.previousReading - d.consumedUnits) > 0.001) {
    warnings.push(`Readings ${d.previousReading} → ${d.currentReading} do not match ${d.consumedUnits} units consumed`)
  }
  if (totalAmount != null && d.total != null && cents(totalAmount) !== cents(d.total)) {
    warnings.push(`Item total RM ${d.total.toFixed(2)} differs from "Total Amount" RM ${totalAmount.toFixed(2)}`)
  }
  return { doc, warnings }
}

// ── YNH electricity invoice ───────────────────────────────────────────────────

const DMONY = '(\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4})'

function chargeLine(lines: string[], label: RegExp): { kwh: number | null; rate: number | null; charge: number | null } {
  for (const l of lines) {
    const m = l.match(label)
    if (!m || m.index == null) continue
    const n = numbersIn(l.slice(m.index + m[0].length))
    if (n.length >= 3) return { kwh: n[0], rate: n[1], charge: n[2] }
    if (n.length === 2) return { kwh: null, rate: n[0], charge: n[1] }
  }
  return { kwh: null, rate: null, charge: null }
}

export function parseYnhInvoice(lines: string[]): ParseResult {
  const doc = emptyDoc('ynh_invoice') as Extract<UtilityDoc, { type: 'ynh_invoice' }>
  const warnings: string[] = []
  const d = doc.data

  d.invoiceNo = firstMatch(lines, /Invoice No\.?\s*:\s*(\S+)/i)?.[1] ?? null
  for (const l of lines) {
    // "Date : 31 Oct 2026", not "Due Date : ..."
    const m = l.match(new RegExp(`(^|\\s)(\\w+\\s+)?Date\\s*:\\s*${DMONY}`, 'i'))
    if (m && !/^(due|invoice)\s*$/i.test((m[2] ?? '').trim())) { d.invoiceDate = dMonY(m[3]); break }
  }
  const period = firstMatch(lines, new RegExp(`Invoice Period\\s*:\\s*${DMONY}\\s*to\\s*${DMONY}`, 'i'))
  d.periodStart = dMonY(period?.[1])
  d.periodEnd = dMonY(period?.[2])
  d.unitNo = firstMatch(lines, /Lot No\.?\s*:\s*(\S+)/i)?.[1] ?? null

  // Top block: Outstanding / Current Charges / Payable Amount (same line, or labels then values).
  d.outstanding = labelAmount(lines, /Outstanding\s*(\(RM\))?\s*:?\s*/i)
  let topCurrent = labelAmount(lines, /Current Charges\s*(\(RM\))?\s*:?\s*/i)
  const payables: number[] = []
  for (const l of lines) {
    const re = /Payable Amount\s*(?:\(RM\))?\s*:?\s*(?:RM)?\s*(\(?-?[\d,]+\.\d{2}\)?)/gi
    for (let m = re.exec(l); m; m = re.exec(l)) {
      const n = parseNum(m[1])
      if (n != null) payables.push(n)
    }
  }
  const header = lines.findIndex((l) => /Outstanding/i.test(l) && /Current Charges/i.test(l) && /Payable/i.test(l) && amountsIn(l).length === 0)
  if (header >= 0) {
    const v = amountsIn(lines[header + 1] ?? '')
    if (v.length >= 3) {
      d.outstanding ??= v[0]
      topCurrent ??= v[1]
      payables.unshift(v[2])
    }
  }

  // Two "Payable Amount" lines: the one equal to outstanding + current is the total.
  if (d.outstanding != null && topCurrent != null) {
    const want = cents(d.outstanding) + cents(topCurrent)
    d.payableTotal = payables.find((p) => cents(p) === want) ?? null
    if (d.payableTotal == null) {
      d.payableTotal = want / 100
      warnings.push(`Total payable computed as outstanding + current charges (RM ${(want / 100).toFixed(2)})`)
    }
  } else if (payables.length) {
    d.payableTotal = Math.max(...payables)
  }
  const sectionD = payables.find((p) => d.payableTotal == null || cents(p) !== cents(d.payableTotal))
  d.currentCharges = topCurrent ?? sectionD ?? null
  if (topCurrent != null && sectionD != null && cents(topCurrent) !== cents(sectionD)) {
    warnings.push(`Current charges RM ${topCurrent.toFixed(2)} differ from section D payable RM ${sectionD.toFixed(2)}`)
  }

  // Consumption line: "01 Oct 2026 TO 31 Oct 2026 <serial> 12,406.00 12,118.00 288.00"
  for (const l of lines) {
    const m = l.match(new RegExp(`${DMONY}\\s+TO\\s+${DMONY}(.*)$`, 'i'))
    if (!m) continue
    const n = amountsIn(m[3])
    if (n.length >= 3) {
      ;[d.currentReading, d.previousReading, d.kwh] = n.slice(-3)
      break
    }
  }

  const energy = chargeLine(lines, /(^|\s)Energy Charges\s*/i)
  const capacity = chargeLine(lines, /Capacity Charges\s*/i)
  const network = chargeLine(lines, /Network Charges\s*/i)
  const eei = chargeLine(lines, /Energy Efficiency Incentive\s*/i)
  const afa = chargeLine(lines, /Automatic Fuel Adjustment\s*/i)
  d.rates = { energy: energy.rate, capacity: capacity.rate, network: network.rate, eei: eei.rate, afa: afa.rate }
  d.kwh ??= energy.kwh

  d.retailCharge = labelAmount(lines, /Retail Charges?\s*(\(RM\))?\s*:?\s*/i)
  const re = firstMatch(lines, /\(\s*(\d+(?:\.\d+)?)\s*%\s*[Xx×]/)
  d.rePct = re ? Number(re[1]) / 100 : null

  if (d.kwh != null && d.currentReading != null && d.previousReading != null &&
      Math.abs(d.currentReading - d.previousReading - d.kwh) > 0.001) {
    warnings.push(`Readings ${d.previousReading} → ${d.currentReading} do not match ${d.kwh} kWh consumed`)
  }
  return { doc, warnings }
}

// ── YNH statement ─────────────────────────────────────────────────────────────

const LEDGER_ROW = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\S+)(.*)$/
const DEPOSIT_RE = /DEPOSIT|CONNECTION FEE|STAMP DUTY/i

export function parseYnhStatement(lines: string[]): ParseResult {
  const doc = emptyDoc('ynh_statement') as Extract<UtilityDoc, { type: 'ynh_statement' }>
  const warnings: string[] = []
  const d = doc.data

  d.statementDate = dmy(firstMatch(lines, /STATEMENT AS AT\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1])
  d.unitNo = firstMatch(lines, /Unit No\.?\s*:\s*(\S+)/i)?.[1] ?? null

  // Split the ledger into blocks: a dated line plus its wrapped particulars, up to TOTAL.
  const blocks: string[][] = []
  for (const l of lines) {
    if (blocks.length && /^TOTAL\b/i.test(l)) {
      const t = amountsIn(l)
      if (t.length) d.printedTotal = t[0]
      break // the ageing table below is ignored
    }
    if (LEDGER_ROW.test(l)) blocks.push([l])
    else if (blocks.length) blocks[blocks.length - 1].push(l)
  }

  for (const b of blocks) {
    const all = b.join(' ')
    if (DEPOSIT_RE.test(all)) continue // YNH's own deposit for the unit, not the tenant's
    const m = b[0].match(LEDGER_ROW)!
    const period = all.match(new RegExp(`${DMONY}\\s*to\\s*${DMONY}`, 'i'))
    let n = amountsIn(m[3])
    if (!n.length) n = amountsIn(b.slice(1).join(' '))
    if (!n.length) {
      // A dated line with no amount and no period is a header, not a ledger row.
      if (period) warnings.push(`Ledger row ${m[2]}: amount not found, add it in the rows table`)
      continue
    }
    // O/S Amount | Debit | Credit | Balance
    const [os, debit, credit] = n.length >= 4 ? n.slice(-4) : [n[0], undefined, undefined]
    let outstanding = os
    if (debit === 0 && credit != null && credit > 0 && outstanding > 0) outstanding = -outstanding // receipt
    const row = {
      date: dmy(m[1]),
      tranNo: m[2],
      periodStart: dMonY(period?.[1]),
      periodEnd: dMonY(period?.[2]),
      outstanding,
    }
    if (!row.periodEnd && outstanding !== 0) {
      warnings.push(`Ledger row ${m[2]} (RM ${outstanding.toFixed(2)}) has no charge period: it is skipped unless you add one`)
    }
    d.rows.push(row)
  }

  if (!d.rows.length) warnings.push('No ledger rows: outstanding taken as RM 0.00')
  if (d.printedTotal != null) {
    const sum = d.rows.reduce((s, r) => s + cents(r.outstanding), 0)
    if (sum !== cents(d.printedTotal)) {
      warnings.push(`Ledger rows add up to RM ${(sum / 100).toFixed(2)} but the printed TOTAL is RM ${d.printedTotal.toFixed(2)}`)
    }
  }
  return { doc, warnings }
}

// ── Entry points ──────────────────────────────────────────────────────────────

/** Parse lines as a given type (used when the user changes a file's type). */
export function parseAs(type: UtilityDocType, lines: string[]): ParseResult {
  switch (type) {
    case 'water_statement': return parseWaterStatement(lines)
    case 'water_invoice': return parseWaterInvoice(lines)
    case 'ynh_invoice': return parseYnhInvoice(lines)
    case 'ynh_statement': return parseYnhStatement(lines)
    default: return { doc: emptyDoc(type), warnings: [] }
  }
}

export function parseUtilityText(lines: string[]): ParseResult {
  if (!lines.some((l) => l.trim())) {
    return {
      doc: emptyDoc('unknown'),
      warnings: ['No text in this PDF (probably a scan): choose its type and type the numbers in'],
    }
  }
  const type = classify(lines)
  if (type === 'unknown') {
    return { doc: emptyDoc('unknown'), warnings: ['Not recognised: choose its type to type the numbers in'] }
  }
  return parseAs(type, lines)
}
