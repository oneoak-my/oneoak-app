// Utility statements: document types (as parsed in the browser by utilityParsers.ts),
// and the pure "plan" that turns recognised documents into the water / electricity
// calculations from utilityCalc.ts. No UI, no network, no AI.

import {
  type ElecInvoice,
  type ElecLedgerRow,
  type ElecProRate,
  type ElecRates,
  type WaterRow,
  UtilityCalcError,
  dayLabel,
  elecCheckIn,
  elecCheckOut,
  firstOfMonth,
  monthLabel,
  parseLocalDate,
  periodLabel,
  toYmd,
  waterCheckIn,
  waterCheckOut,
  ymd,
} from './utilityCalc'

// ── Config ────────────────────────────────────────────────────────────────────

export const UTILITY_BUILDINGS = ['Ooak Residence', 'Ooak Suites']

export const WATER_SERVICE = 'Outstanding Water Bill'
export const ELEC_SERVICE = 'Outstanding Electricity Bill'
export const ELEC_PROVIDER = 'YNH Utility Sdn Bhd'
export function waterProviderFor(building: string): string {
  return building === 'Ooak Suites' ? 'Ooak Suites management' : 'Ooak Residence management'
}

export const MAX_UTILITY_FILES = 6
export const MAX_UTILITY_FILE_BYTES = 10 * 1024 * 1024
const HIGH_USAGE_M3 = 30
const WATER_RATE = 3.83

// ── Document types ────────────────────────────────────────────────────────────

export type UtilityDocType =
  | 'water_statement'
  | 'water_invoice'
  | 'water_meter_photo'
  | 'ynh_invoice'
  | 'ynh_statement'
  | 'unknown'

export const DOC_TYPE_LABELS: Record<UtilityDocType, string> = {
  water_statement: 'Water statement',
  water_invoice: 'Water invoice',
  water_meter_photo: 'Water meter photo',
  ynh_invoice: 'YNH electricity invoice',
  ynh_statement: 'YNH electricity statement',
  unknown: 'Not recognised',
}

export type WaterStatementRow = WaterRow & { invoiceDate: string | null }
export type WaterStatementData = {
  unitNo: string | null
  statementDate: string | null
  rows: WaterStatementRow[]
  /** Printed outstanding total from the "Total Record(s)" line. */
  printedTotal: number | null
}
export type WaterInvoiceData = {
  unitNo: string | null
  invoiceNo: string | null
  invoiceDate: string | null
  periodStart: string | null
  periodEnd: string | null
  total: number | null
  previousReading: number | null
  currentReading: number | null
  consumedUnits: number | null
}
/** Photos are attachments only (never read); the reading is typed. */
export type MeterPhotoData = Record<string, never>
export type YnhInvoiceData = {
  unitNo: string | null
  invoiceNo: string | null
  invoiceDate: string | null
  periodStart: string | null
  periodEnd: string | null
  previousReading: number | null
  currentReading: number | null
  kwh: number | null
  rates: { energy: number | null; capacity: number | null; network: number | null; eei: number | null; afa: number | null }
  retailCharge: number | null
  /** Fraction: 0.016 for 1.60% */
  rePct: number | null
  outstanding: number | null
  /** Section D "Payable Amount": this month's charges only. */
  currentCharges: number | null
  /** Top-block "Payable Amount": outstanding + current charges. */
  payableTotal: number | null
}
export type YnhStatementRow = ElecLedgerRow & { date: string | null; tranNo: string | null }
export type YnhStatementData = {
  unitNo: string | null
  statementDate: string | null
  rows: YnhStatementRow[]
  printedTotal: number | null
}

export type UtilityDoc =
  | { type: 'water_statement'; data: WaterStatementData }
  | { type: 'water_invoice'; data: WaterInvoiceData }
  | { type: 'water_meter_photo'; data: MeterPhotoData }
  | { type: 'ynh_invoice'; data: YnhInvoiceData }
  | { type: 'ynh_statement'; data: YnhStatementData }
  | { type: 'unknown'; data: Record<string, never> }

/** A blank document of the given type, for typing the numbers in by hand. */
export function emptyDoc(type: UtilityDocType): UtilityDoc {
  switch (type) {
    case 'water_statement':
      return { type, data: { unitNo: null, statementDate: null, rows: [], printedTotal: null } }
    case 'water_invoice':
      return {
        type,
        data: {
          unitNo: null, invoiceNo: null, invoiceDate: null, periodStart: null, periodEnd: null,
          total: null, previousReading: null, currentReading: null, consumedUnits: null,
        },
      }
    case 'ynh_invoice':
      return {
        type,
        data: {
          unitNo: null, invoiceNo: null, invoiceDate: null, periodStart: null, periodEnd: null,
          previousReading: null, currentReading: null, kwh: null,
          rates: { energy: null, capacity: null, network: null, eei: null, afa: null },
          retailCharge: null, rePct: null, outstanding: null, currentCharges: null, payableTotal: null,
        },
      }
    case 'ynh_statement':
      return { type, data: { unitNo: null, statementDate: null, rows: [], printedTotal: null } }
    case 'water_meter_photo':
      return { type, data: {} }
    default:
      return { type: 'unknown', data: {} }
  }
}

/** Fields the calculation needs that are still empty (shown as warnings + editable fields). */
export function missingFields(doc: UtilityDoc): string[] {
  const m: string[] = []
  const need = (v: unknown, name: string) => { if (v == null || v === '') m.push(name) }
  switch (doc.type) {
    case 'water_statement':
      need(doc.data.unitNo, 'unit')
      if (!doc.data.rows.length) m.push('statement rows')
      break
    case 'water_invoice':
      need(doc.data.unitNo, 'unit')
      need(doc.data.periodEnd, 'period end')
      need(doc.data.currentReading, 'current reading')
      break
    case 'ynh_invoice': {
      const d = doc.data
      need(d.unitNo, 'unit')
      need(d.periodStart, 'period start')
      need(d.periodEnd, 'period end')
      need(d.currentReading, 'current reading')
      need(d.rates.energy, 'energy rate')
      need(d.rates.capacity, 'capacity rate')
      need(d.rates.network, 'network rate')
      need(d.rates.afa, 'AFA rate')
      need(d.retailCharge, 'retail charge')
      need(d.rePct, 'RE %')
      need(d.payableTotal, 'payable amount (total)')
      break
    }
    case 'ynh_statement':
      need(doc.data.unitNo, 'unit')
      break
  }
  return m
}

// ── Unit matching ─────────────────────────────────────────────────────────────

// A unit code anywhere in a string: "A-35-05A", "A-23A-3A", "T2-16-7", "B-7-7", "17-09", "A2709",
// and Cuci Clan's spaced style "A 26-06" / "B 21-3a" (block letter, space, floor-unit).
// Bounded by start/end or a non-alphanumeric character (no lookbehind: older iOS Safari rejects it).
const UNIT_CODE_RE =
  /(?:^|[^A-Za-z0-9])((?:[A-Za-z]{1,2}\d{0,2}[- ]?)?\d{1,3}[A-Za-z]?-\d{1,3}[A-Za-z]?|[A-Za-z]{1,2}\d{3,6}[A-Za-z]?)(?=$|[^A-Za-z0-9])/

/** The bare unit code as printed, e.g. "A-35-05A Ooak Residence" → "A-35-05A", "A 26-06 The Oak" → "A 26-06". */
export function findUnitCode(str: string): string | null {
  return str.match(UNIT_CODE_RE)?.[1] ?? null
}
const unitCode = findUnitCode

/**
 * Canonical unit code: extracted from any string (building names and extra words ignored),
 * uppercased, leading zeros removed from each segment. "A-35-05A Ooak Residence" → "A-35-5A",
 * "B-07-07" → "B-7-7", "01-10" → "1-10". Returns null if no unit code is found.
 */
export function normaliseUnit(str: string | null | undefined): string | null {
  const code = str ? unitCode(str) : null
  if (!code) return null
  return code
    .toUpperCase()
    .split(/[- ]/)
    .filter(Boolean)
    .map((seg) => seg.replace(/^0+(?=[0-9A-Z])/, ''))
    .join('-')
}

/** "A-35-05A" matches "A-35-5a Ooak Residence"; "A2709" also matches "A-27-09". */
export function unitsMatch(a: string, b: string): boolean {
  const na = normaliseUnit(a)
  const nb = normaliseUnit(b)
  if (na && nb) {
    if (na === nb) return true
    // Same characters, different dashes (e.g. "A2709" vs "A-27-09").
    const flat = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return flat(unitCode(a)!) === flat(unitCode(b)!)
  }
  // No recognisable code on one side: fall back to comparing the whole strings loosely.
  const loose = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return loose(a) === loose(b)
}

export function docUnit(doc: UtilityDoc): string | null {
  return doc.type === 'unknown' || doc.type === 'water_meter_photo' ? null : doc.data.unitNo
}

/** Short "period" text for the review list. */
export function docPeriod(doc: UtilityDoc): string {
  switch (doc.type) {
    case 'water_statement':
    case 'ynh_statement': {
      const ends = doc.data.rows.map((r) => r.periodEnd).filter((x): x is string => !!x).sort()
      const starts = doc.data.rows.map((r) => r.periodStart).filter((x): x is string => !!x).sort()
      if (!starts.length || !ends.length) return `${doc.data.rows.length} rows`
      return `${monthLabel(starts[0])} – ${monthLabel(ends[ends.length - 1])} (${doc.data.rows.length} rows)`
    }
    case 'water_invoice':
    case 'ynh_invoice':
      return doc.data.periodStart && doc.data.periodEnd ? periodLabel(doc.data.periodStart, doc.data.periodEnd) : 'period not found'
    case 'water_meter_photo':
      return 'attached only (type the reading below)'
    default:
      return ''
  }
}

// ── Plan: documents → calculations ────────────────────────────────────────────

export type PlanDoc = {
  id: string
  name: string
  doc: UtilityDoc
  /** "Use anyway": include the document despite a unit mismatch. */
  useAnyway?: boolean
  /** "Use anyway": use this YNH invoice although it is not for the month before the reading. */
  useInvoiceAnyway?: boolean
}

/** Hand-edited rates (anything left undefined comes from the matched invoice). */
export type RateOverrides = Partial<Pick<ElecRates, 'energy' | 'capacity' | 'network' | 'afa'>> & { retailCharge?: number }

export type PlanInput = {
  recordType: 'checkin' | 'checkout'
  unitNo: string
  dualKey: boolean
  /** Check-in: move_in_date ?? date. Check-out: record.date. */
  eventDate: string
  /** Check-out only. */
  tenancyStart: string | null
  docs: PlanDoc[]
  elecReading: number | null
  elecReadingDate: string
  /** Check-out water: the typed water meter reading (m³). */
  photoReading: number | null
  /** Electricity rates edited by hand (default: the matched invoice's rates). */
  rateOverrides?: RateOverrides
}

/** Everything the pro-rate PDF shows; the figures are utilityCalc's own (no second formula). */
export type ElecProRateDetails = {
  isCheckIn: boolean
  /** Move-in / move-out date. */
  eventDate: string
  readingDate: string
  currentReading: number
  previousReading: number
  /** The matched invoice's period end (date of the previous reading). */
  previousDate: string
  invoicePeriodLabel: string
  rates: ElecRates
  retailCharge: number
  rePct: number
  stub: ElecProRate
}

export type UtilityPlan = {
  amount: number
  steps: string[]
  note: string
  /** Doc ids per invoice slot (1..3); null = keep whatever is in that slot. */
  slots: (string | null)[]
  /** Electricity only: the pro-rated usage, for the pro-rate PDF. */
  proRate?: ElecProRateDetails
}

export type UtilityOutcome = UtilityPlan | { error: string; steps?: string[] } | null

export type Plan = {
  water: UtilityOutcome
  elec: UtilityOutcome
  warnings: string[]
  /** Doc ids left out of the calculation (unit mismatch). */
  excluded: string[]
  /** Attached meter photo (shown beside the typed reading). */
  photoDocId: string | null
  /** The YNH invoice used for rates and the previous reading (as printed, before any hand edits). */
  elecInvoice: {
    docId: string
    periodLabel: string
    monthLabel: string
    periodEnd: string
    currentReading: number | null
    rates: YnhInvoiceData['rates']
    retailCharge: number | null
    rePct: number | null
  } | null
  /** Month the YNH invoice must be for: the month before the reading date, e.g. "Oct 2026". */
  expectedInvoiceMonth: string
  /** YNH invoices for another month: shown with a warning and a "Use anyway" button. */
  invoiceMonthIssues: { docId: string; message: string; usedAnyway: boolean }[]
}

const rmStr = (n: number) => `RM ${n.toFixed(2)}`

/** "1-14 Nov 2026", "15 Oct-14 Nov 2026" or "20 Dec 2025-5 Jan 2026". */
function rangeLabel(from: string, to: string): string {
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  const M = (d: Date) => monthLabel(toYmd(d)).split(' ')[0]
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}-${b.getDate()} ${M(b)} ${b.getFullYear()}`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} ${M(a)}-${b.getDate()} ${M(b)} ${b.getFullYear()}`
  }
  return `${dayLabel(from)}-${dayLabel(to)}`
}

function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr)
  return toYmd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}
const dayAfter = (s: string) => addDays(s, 1)
const dayBefore = (s: string) => addDays(s, -1)

function monthRange(starts: string[], ends: string[]): string {
  const first = monthLabel(starts[0])
  const last = monthLabel(ends[ends.length - 1])
  return first === last ? first : `${first}-${last}`
}

function latestBy<T>(items: T[], key: (t: T) => string | null): T {
  return [...items].sort((a, b) => (key(b) ?? '').localeCompare(key(a) ?? ''))[0]
}

function errMsg(e: unknown): string {
  return e instanceof UtilityCalcError || e instanceof Error ? e.message : String(e)
}

function toElecInvoice(d: YnhInvoiceData): { invoice: ElecInvoice } | { missing: string[] } {
  const missing: string[] = []
  const need = <T>(v: T | null, name: string): T => {
    if (v == null) missing.push(name)
    return v as T
  }
  const invoice: ElecInvoice = {
    periodStart: need(d.periodStart, 'period start'),
    periodEnd: need(d.periodEnd, 'period end'),
    previousReading: d.previousReading ?? 0,
    currentReading: need(d.currentReading, 'current reading'),
    rates: {
      energy: need(d.rates.energy, 'energy rate'),
      capacity: need(d.rates.capacity, 'capacity rate'),
      network: need(d.rates.network, 'network rate'),
      eei: d.rates.eei ?? 0,
      afa: need(d.rates.afa, 'AFA rate'),
    },
    retailCharge: need(d.retailCharge, 'retail charge'),
    rePct: need(d.rePct, 'RE %'),
    outstandingBF: d.outstanding ?? 0,
    currentCharges: d.currentCharges ?? 0,
    // Everything owed up to the invoice's period end = the top-block payable (outstanding + current).
    payable: need(d.payableTotal, 'payable amount (total)'),
  }
  return missing.length ? { missing } : { invoice }
}

export function buildPlan(input: PlanInput): Plan {
  const { recordType, unitNo, dualKey, eventDate, docs } = input
  const isCheckIn = recordType === 'checkin'
  const warnings: string[] = []
  const excluded: string[] = []

  // 1) Unit checks: mismatched documents are shown but never used.
  const usable: PlanDoc[] = []
  for (const d of docs) {
    if (d.doc.type === 'unknown') {
      warnings.push(`${d.name}: not recognised as a water or YNH document, ignored`)
      continue
    }
    const u = docUnit(d.doc)
    if (u && !unitsMatch(u, unitNo)) {
      if (d.useAnyway) {
        warnings.push(`${d.name}: unit ${u} does not match ${unitNo}, used anyway as you chose`)
      } else {
        warnings.push(`${d.name}: unit ${u} does not match ${unitNo}, not used`)
        excluded.push(d.id)
        continue
      }
    }
    if (!u && d.doc.type !== 'water_meter_photo') {
      warnings.push(`${d.name}: no unit number found on the document, please check it is for ${unitNo}`)
    }
    usable.push(d)
  }

  const ofType = <T extends UtilityDocType>(type: T) =>
    usable.filter((d): d is PlanDoc & { doc: Extract<UtilityDoc, { type: T }> } => d.doc.type === type)

  const pick = <T extends UtilityDocType>(type: T, key: (d: Extract<UtilityDoc, { type: T }>) => string | null) => {
    const list = ofType(type)
    if (!list.length) return null
    const chosen = latestBy(list, (d) => key(d.doc))
    if (list.length > 1) warnings.push(`${list.length} ${DOC_TYPE_LABELS[type].toLowerCase()}s: using ${chosen.name} (the latest)`)
    return chosen
  }

  const wStatement = pick('water_statement', (d) => d.data.statementDate ?? d.data.rows.map((r) => r.periodEnd).sort().pop() ?? null)
  const wInvoice = pick('water_invoice', (d) => d.data.periodEnd)
  const wPhoto = pick('water_meter_photo', () => null)
  // YNH invoice rule: it must be for the month BEFORE the meter reading date
  // (reading 14 Nov 2026 → invoice period Oct 2026). Others are not used unless "Use anyway".
  const expectedEnd = dayBefore(firstOfMonth(input.elecReadingDate || eventDate))
  const expectedInvoiceMonth = monthLabel(expectedEnd)
  const yInvoices = ofType('ynh_invoice')
  const invoiceMonthIssues: Plan['invoiceMonthIssues'] = []
  const byEnd = (d: (typeof yInvoices)[number]) => d.doc.data.periodEnd
  let yInvoice: (typeof yInvoices)[number] | null = null
  const matching = yInvoices.filter((d) => d.doc.data.periodEnd && firstOfMonth(d.doc.data.periodEnd) === firstOfMonth(expectedEnd))
  if (matching.length) {
    yInvoice = latestBy(matching, byEnd)
  } else {
    for (const d of yInvoices) {
      const actual = d.doc.data.periodEnd ? monthLabel(d.doc.data.periodEnd) : 'an unknown month'
      const message =
        `Latest invoice should be for ${expectedInvoiceMonth} (the month before the reading date); the uploaded invoice is for ${actual}`
      invoiceMonthIssues.push({ docId: d.id, message, usedAnyway: !!d.useInvoiceAnyway })
      warnings.push(d.useInvoiceAnyway ? `${d.name}: invoice for ${actual} used anyway (expected ${expectedInvoiceMonth})` : `${d.name}: ${message}`)
    }
    const forced = yInvoices.filter((d) => d.useInvoiceAnyway)
    if (forced.length) yInvoice = latestBy(forced, byEnd)
  }
  const yStatement = pick('ynh_statement', (d) => d.data.statementDate)

  // ── Water ──
  let water: UtilityOutcome = null
  if (wStatement || wInvoice || wPhoto) {
    // Rows typed by hand count once both period dates are filled in.
    const rows = (wStatement?.doc.data.rows ?? []).filter((r) => r.periodStart && r.periodEnd)
    for (const r of rows) {
      if (r.amount > HIGH_USAGE_M3 * WATER_RATE) {
        warnings.push(`Water ${periodLabel(r.periodStart, r.periodEnd)}: ${rmStr(r.amount)} means over ${HIGH_USAGE_M3} m³ that month, please check`)
      }
    }
    if (wInvoice) {
      const { previousReading: p, currentReading: c } = wInvoice.doc.data
      if (p != null && c != null && c - p > HIGH_USAGE_M3) {
        const no = wInvoice.doc.data.invoiceNo ? ` ${wInvoice.doc.data.invoiceNo}` : ''
        warnings.push(`Water invoice${no}: usage ${c - p} m³ is over ${HIGH_USAGE_M3} m³ in a month`)
      }
    }

    if (wStatement && wStatement.doc.data.printedTotal != null && rows.length) {
      const sumC = rows.reduce((s, r) => s + Math.round(r.outstanding * 100), 0)
      if (sumC !== Math.round(wStatement.doc.data.printedTotal * 100)) {
        warnings.push(
          `Water statement rows add up to ${rmStr(sumC / 100)} but the printed total is ${rmStr(wStatement.doc.data.printedTotal)}: check the rows`,
        )
      }
    }

    if (!wStatement) {
      water = { error: 'Add the water statement (the management statement listing every invoice)' }
    } else if (!rows.length) {
      water = { error: 'No rows read from the water statement: add them in the statement rows table' }
    } else if (isCheckIn) {
      try {
        const r = waterCheckIn({ rows, moveInDate: eventDate, dualKey })
        const parts: string[] = []
        if (r.included.length) {
          parts.push(`${monthRange(r.included.map((p) => p.start), r.included.map((p) => p.end))} ${rmStr(r.amount - r.addition)}`)
        } else {
          parts.push(`Nothing outstanding before ${monthLabel(eventDate)}`)
        }
        const nets = r.netted.map((n) => `${n.label} duplicate netted ${rmStr(n.paid)}`)
        let note = parts[0] + (nets.length ? ` (${nets.join(', ')})` : '')
        if (r.addition) note += ` + half ${monthLabel(eventDate)} ${rmStr(r.addition)}`
        water = { amount: r.amount, steps: r.steps, note, slots: [wStatement.id, wInvoice?.id ?? null, wPhoto?.id ?? null] }
      } catch (e) {
        water = { error: errMsg(e) }
      }
    } else {
      // Check-out
      const start = input.tenancyStart
      if (!start) {
        warnings.push('Tenancy start date missing: enter it to work out the tenant’s share')
        water = { error: 'Tenancy start date needed' }
      } else {
        const latestRowEnd = rows.map((r) => r.periodEnd).sort().pop()!
        if (wInvoice?.doc.data.periodEnd && wInvoice.doc.data.periodEnd !== latestRowEnd) {
          warnings.push(
            `Water invoice period ends ${dayLabel(wInvoice.doc.data.periodEnd)} but the statement's latest bill ends ${dayLabel(latestRowEnd)}`,
          )
        }
        const inv = wInvoice?.doc.data
        const latestInvoice = inv?.periodEnd && inv.currentReading != null
          ? { periodEnd: inv.periodEnd, currentReading: inv.currentReading }
          : undefined
        const photoReading = input.photoReading ?? undefined
        try {
          const r = waterCheckOut({ rows, tenancyStart: start, moveOutDate: eventDate, dualKey, latestInvoice, photoReading })
          warnings.push(...r.warnings)
          if (r.extra && r.extra.usage > HIGH_USAGE_M3) {
            warnings.push(`Water usage since the last invoice is ${r.extra.usage} m³ (over ${HIGH_USAGE_M3} m³ in a month)`)
          }
          let note = r.included.length
            ? `${monthRange(r.included.map((p) => p.start), r.included.map((p) => p.end))}`
            : 'Nothing outstanding in tenancy'
          const nets = r.netted.map((n) => `${n.label} duplicate netted ${rmStr(n.paid)}`)
          if (nets.length) note += ` (${nets.join(', ')})`
          if (r.extra) note += ` + ${monthLabel(eventDate)} pro-rated ${rmStr(r.extra.bill)} (${r.extra.usage} m3)`
          water = { amount: r.amount, steps: r.steps, note, slots: [wStatement.id, wInvoice?.id ?? null, wPhoto?.id ?? null] }
        } catch (e) {
          let msg = errMsg(e)
          if (/below/.test(msg)) warnings.push(`Water: negative usage. ${msg}`)
          if (/required/.test(msg)) {
            msg = photoReading == null
              ? `No bill covers ${monthLabel(eventDate)} yet: type the water meter reading (m³)`
              : `No bill covers ${monthLabel(eventDate)} yet: add the latest water invoice (for its current reading)`
          }
          water = { error: msg }
        }
      }
    }
  }

  // ── Electricity ──
  let elec: UtilityOutcome = null
  let elecInvoice: Plan['elecInvoice'] = null
  if (yInvoices.length || yStatement) {
    const ledger = yStatement?.doc.data.rows
    if (yInvoice) {
      const d = yInvoice.doc.data
      elecInvoice = {
        docId: yInvoice.id,
        periodLabel: d.periodStart && d.periodEnd ? periodLabel(d.periodStart, d.periodEnd) : 'period not read',
        monthLabel: d.periodEnd ? monthLabel(d.periodEnd) : '',
        periodEnd: d.periodEnd ?? '',
        currentReading: d.currentReading,
        rates: d.rates,
        retailCharge: d.retailCharge,
        rePct: d.rePct,
      }
    }
    if (!yInvoice) {
      elec = {
        error: yInvoices.length
          ? `Add the YNH invoice for ${expectedInvoiceMonth} (or press "Use anyway" on the one uploaded)`
          : 'Add the YNH invoice (it has the rates and the last meter reading)',
      }
    } else {
      const conv = toElecInvoice(yInvoice.doc.data)
      if ('missing' in conv) {
        elec = { error: `YNH invoice: fill in ${conv.missing.join(', ')}` }
      } else {
        // Rates always come from the matched invoice; hand edits (if any) override single values. EEI is ignored in the calc.
        const ov = input.rateOverrides ?? {}
        const invoice: ElecInvoice = {
          ...conv.invoice,
          rates: {
            ...conv.invoice.rates,
            ...(ov.energy != null ? { energy: ov.energy } : {}),
            ...(ov.capacity != null ? { capacity: ov.capacity } : {}),
            ...(ov.network != null ? { network: ov.network } : {}),
            ...(ov.afa != null ? { afa: ov.afa } : {}),
          },
          retailCharge: ov.retailCharge ?? conv.invoice.retailCharge,
        }
        const details = (stub: ElecProRate): ElecProRateDetails => ({
          isCheckIn,
          eventDate,
          readingDate: input.elecReadingDate,
          currentReading: input.elecReading!,
          previousReading: invoice.currentReading,
          previousDate: invoice.periodEnd,
          invoicePeriodLabel: periodLabel(invoice.periodStart, invoice.periodEnd),
          rates: { ...invoice.rates, eei: stub.eeiRate },
          retailCharge: invoice.retailCharge,
          rePct: invoice.rePct,
          stub,
        })
        if (ledger && ledger.length && !ledger.some((r) => r.periodEnd === invoice.periodEnd)) {
          warnings.push(`YNH invoice period (${periodLabel(invoice.periodStart, invoice.periodEnd)}) is not on the YNH statement`)
        }
        const reading = input.elecReading
        const readingDate = input.elecReadingDate
        try {
          if (isCheckIn) {
            if (reading == null) throw new UtilityCalcError('Type the electricity meter reading (kWh)')
            const r = elecCheckIn({ invoice, ledger, moveInDate: eventDate, readingAsOf: reading })
            warnings.push(...r.warnings)
            const upTo = ledger
              ? monthLabel(dayBefore(firstOfMonth(eventDate)))
              : monthLabel(invoice.periodEnd)
            const note =
              `Outstanding to ${upTo} ${rmStr(r.before)} + pro-rated ${rangeLabel(dayAfter(invoice.periodEnd), readingDate)} ` +
              `${rmStr(r.stub.total)} (${r.stub.kwh} kWh)`
            elec = { amount: r.amount, steps: r.steps, note, slots: [yInvoice.id, yStatement?.id ?? null, null], proRate: details(r.stub) }
          } else {
            const start = input.tenancyStart
            if (!start && ledger) {
              warnings.push('Tenancy start date missing: enter it to work out the tenant’s share')
              throw new UtilityCalcError('Tenancy start date needed')
            }
            if (ymd(invoice.periodEnd) < firstOfMonth(dayBefore(firstOfMonth(eventDate)))) {
              warnings.push(
                `YNH invoice ends ${dayLabel(invoice.periodEnd)}, more than a month before move-out: the pro-rated usage covers a long period`,
              )
            }
            const r = elecCheckOut({
              invoice, ledger, tenancyStart: start ?? eventDate, moveOutDate: eventDate, readingAsOf: reading ?? undefined,
            })
            warnings.push(...r.warnings)
            let note = ledger && start
              ? `Tenancy ${monthLabel(start)}-${monthLabel(eventDate)} ${rmStr(r.tenantPart)}`
              : `Invoice to ${monthLabel(invoice.periodEnd)} ${rmStr(r.tenantPart)}`
            if (r.stub) {
              note += ` + pro-rated ${rangeLabel(dayAfter(invoice.periodEnd), readingDate)} ${rmStr(r.stub.total)} (${r.stub.kwh} kWh)`
            }
            elec = {
              amount: r.amount, steps: r.steps, note, slots: [yInvoice.id, yStatement?.id ?? null, null],
              ...(r.stub ? { proRate: details(r.stub) } : {}),
            }
          }
        } catch (e) {
          const msg = errMsg(e)
          if (/below/.test(msg)) warnings.push(`Electricity: negative usage. ${msg}`)
          elec = { error: msg }
        }
      }
    }
  }

  return { water, elec, warnings, excluded, photoDocId: wPhoto?.id ?? null, elecInvoice, expectedInvoiceMonth, invoiceMonthIssues }
}
