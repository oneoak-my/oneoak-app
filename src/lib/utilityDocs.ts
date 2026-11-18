// Utility statements: document types read by /api/read-utility, clean-up of the
// model's JSON, and the pure "plan" that turns recognised documents into the
// water / electricity calculations from utilityCalc.ts. No UI, no network.
// The model only extracts; every number below is computed here in code.

import {
  type ElecInvoice,
  type ElecLedgerRow,
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

export type WaterStatementData = { unitNo: string | null; statementDate: string | null; rows: WaterRow[] }
export type WaterInvoiceData = {
  unitNo: string | null
  invoiceNo: string | null
  periodStart: string | null
  periodEnd: string | null
  total: number | null
  previousReading: number | null
  currentReading: number | null
}
export type MeterPhotoData = { reading: number | null; confidence: 'high' | 'low'; dateStamp: string | null }
export type YnhInvoiceData = {
  unitNo: string | null
  periodStart: string | null
  periodEnd: string | null
  previousReading: number | null
  currentReading: number | null
  rates: { energy: number | null; capacity: number | null; network: number | null; eei: number | null; afa: number | null }
  retailCharge: number | null
  rePct: number | null
  outstandingBF: number | null
  currentCharges: number | null
  payable: number | null
}
export type YnhStatementData = {
  unitNo: string | null
  statementDate: string | null
  rows: ElecLedgerRow[]
  total: number | null
}

export type UtilityDoc =
  | { type: 'water_statement'; data: WaterStatementData }
  | { type: 'water_invoice'; data: WaterInvoiceData }
  | { type: 'water_meter_photo'; data: MeterPhotoData }
  | { type: 'ynh_invoice'; data: YnhInvoiceData }
  | { type: 'ynh_statement'; data: YnhStatementData }
  | { type: 'unknown'; data: Record<string, never> }

/** Per-file result returned by /api/read-utility. */
export type UtilityReadResult = (UtilityDoc & { warning?: string }) | { error: string }

// ── Clean-up of model output ──────────────────────────────────────────────────

/** "1,234.50", "RM 12.00", "(1.05)", "-0.75" → number; anything else → null. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t) || /\bCR\b/i.test(t)
  const digits = t.replace(/[^0-9.]/g, '')
  if (!digits || digits === '.') return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** Accepts 'YYYY-MM-DD' (or an ISO timestamp) only; returns null otherwise. */
export function toDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toStr(v: unknown): string | null {
  if (typeof v === 'number') return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : []
}

const DOC_TYPES: UtilityDocType[] = [
  'water_statement', 'water_invoice', 'water_meter_photo', 'ynh_invoice', 'ynh_statement', 'unknown',
]

/** Turns the model's loose JSON into a typed document (dropping unusable rows). */
export function normalizeDoc(type: unknown, raw: unknown): UtilityDoc {
  const t = DOC_TYPES.includes(type as UtilityDocType) ? (type as UtilityDocType) : 'unknown'
  const d = obj(raw)
  switch (t) {
    case 'water_statement': {
      const rows: WaterRow[] = []
      for (const r of arr(d.rows)) {
        const periodStart = toDate(r.periodStart)
        const periodEnd = toDate(r.periodEnd)
        if (!periodStart || !periodEnd) continue
        rows.push({
          invoiceNo: toStr(r.invoiceNo) ?? '',
          periodStart,
          periodEnd,
          amount: toNum(r.amount) ?? 0,
          paid: Math.abs(toNum(r.paid) ?? 0),
          outstanding: toNum(r.outstanding) ?? 0,
        })
      }
      return { type: t, data: { unitNo: toStr(d.unitNo), statementDate: toDate(d.statementDate), rows } }
    }
    case 'water_invoice':
      return {
        type: t,
        data: {
          unitNo: toStr(d.unitNo),
          invoiceNo: toStr(d.invoiceNo),
          periodStart: toDate(d.periodStart),
          periodEnd: toDate(d.periodEnd),
          total: toNum(d.total),
          previousReading: toNum(d.previousReading),
          currentReading: toNum(d.currentReading),
        },
      }
    case 'water_meter_photo': {
      const reading = toNum(d.reading)
      return {
        type: t,
        data: {
          reading: reading == null ? null : Math.floor(Math.abs(reading)),
          confidence: d.confidence === 'high' ? 'high' : 'low',
          dateStamp: toDate(d.dateStamp),
        },
      }
    }
    case 'ynh_invoice': {
      const rates = obj(d.rates)
      const eei = toNum(rates.eei)
      return {
        type: t,
        data: {
          unitNo: toStr(d.unitNo),
          periodStart: toDate(d.periodStart),
          periodEnd: toDate(d.periodEnd),
          previousReading: toNum(d.previousReading),
          currentReading: toNum(d.currentReading),
          rates: {
            energy: toNum(rates.energy),
            capacity: toNum(rates.capacity),
            network: toNum(rates.network),
            eei: eei == null ? null : -Math.abs(eei),
            afa: toNum(rates.afa),
          },
          retailCharge: toNum(d.retailCharge),
          rePct: normalizeRePct(toNum(d.rePct)),
          outstandingBF: toNum(d.outstandingBF),
          currentCharges: toNum(d.currentCharges),
          payable: toNum(d.payable),
        },
      }
    }
    case 'ynh_statement': {
      const rows: ElecLedgerRow[] = []
      for (const r of arr(d.rows)) {
        const outstanding = toNum(r.outstanding)
        if (outstanding == null) continue
        rows.push({ periodStart: toDate(r.periodStart), periodEnd: toDate(r.periodEnd), outstanding })
      }
      return {
        type: t,
        data: { unitNo: toStr(d.unitNo), statementDate: toDate(d.statementDate), rows, total: toNum(d.total) },
      }
    }
    default:
      return { type: 'unknown', data: {} }
  }
}

/** "1.60%" may come back as 1.6 or 0.016: always return the fraction. */
function normalizeRePct(v: number | null): number | null {
  if (v == null) return null
  return v > 0.5 ? v / 100 : v
}

// ── Unit matching ─────────────────────────────────────────────────────────────

function unitSegments(u: string): string {
  return u
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((seg) => seg.replace(/^0+(?=[0-9A-Z])/, ''))
    .join('-')
}

/** "A-27-09", "A-27-9", "a 27 09" and "A2709" all match. */
export function unitsMatch(a: string, b: string): boolean {
  if (unitSegments(a) === unitSegments(b)) return true
  const flat = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return flat(a) === flat(b)
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
      return doc.data.reading == null
        ? 'reading not found'
        : `${doc.data.reading} m³${doc.data.dateStamp ? ` · ${dayLabel(doc.data.dateStamp)}` : ''}`
    default:
      return ''
  }
}

// ── Plan: documents → calculations ────────────────────────────────────────────

export type PlanDoc = { id: string; name: string; doc: UtilityDoc }

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
  /** Check-out water: the (possibly hand-corrected) meter photo reading. */
  photoReading: number | null
}

export type UtilityPlan = {
  amount: number
  steps: string[]
  note: string
  /** Doc ids per invoice slot (1..3); null = keep whatever is in that slot. */
  slots: (string | null)[]
}

export type UtilityOutcome = UtilityPlan | { error: string; steps?: string[] } | null

export type Plan = {
  water: UtilityOutcome
  elec: UtilityOutcome
  warnings: string[]
  /** Doc ids left out of the calculation (unit mismatch). */
  excluded: string[]
  /** Chosen photo for the check-out reading box. */
  photoDocId: string | null
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
    outstandingBF: d.outstandingBF ?? 0,
    currentCharges: d.currentCharges ?? 0,
    payable: need(d.payable, 'amount payable'),
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
      warnings.push(`${d.name}: unit ${u} does not match ${unitNo}, not used`)
      excluded.push(d.id)
      continue
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
  const wPhoto = pick('water_meter_photo', (d) => d.data.dateStamp)
  const yInvoice = pick('ynh_invoice', (d) => d.data.periodEnd)
  const yStatement = pick('ynh_statement', (d) => d.data.statementDate)

  // ── Water ──
  let water: UtilityOutcome = null
  if (wStatement || wInvoice || wPhoto) {
    const rows = wStatement?.doc.data.rows ?? []
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

    if (!wStatement) {
      water = { error: 'Water statement needed (the management statement listing every invoice)' }
    } else if (!rows.length) {
      water = { error: 'No rows could be read from the water statement' }
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
        if (wPhoto && wPhoto.doc.data.confidence === 'low') {
          warnings.push('Water meter photo reading is low confidence: check the number against the photo')
        }
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
          const msg = errMsg(e)
          if (/below/.test(msg)) warnings.push(`Water: negative usage. ${msg}`)
          water = { error: msg }
        }
      }
    }
  }

  // ── Electricity ──
  let elec: UtilityOutcome = null
  if (yInvoice || yStatement) {
    const ledger = yStatement?.doc.data.rows
    if (!yInvoice) {
      elec = { error: 'YNH invoice needed (it has the rates and the last meter reading)' }
    } else {
      const conv = toElecInvoice(yInvoice.doc.data)
      if ('missing' in conv) {
        elec = { error: `YNH invoice: could not read ${conv.missing.join(', ')}` }
      } else {
        const invoice = conv.invoice
        if (ledger && ledger.length && !ledger.some((r) => r.periodEnd === invoice.periodEnd)) {
          warnings.push(`YNH invoice period (${periodLabel(invoice.periodStart, invoice.periodEnd)}) is not on the YNH statement`)
        }
        const reading = input.elecReading
        const readingDate = input.elecReadingDate
        try {
          if (isCheckIn) {
            if (reading == null) throw new UtilityCalcError('Enter the electricity meter reading (kWh)')
            const r = elecCheckIn({ invoice, ledger, moveInDate: eventDate, readingAsOf: reading })
            warnings.push(...r.warnings)
            const upTo = ledger
              ? monthLabel(dayBefore(firstOfMonth(eventDate)))
              : monthLabel(invoice.periodEnd)
            const note =
              `Outstanding to ${upTo} ${rmStr(r.before)} + pro-rated ${rangeLabel(dayAfter(invoice.periodEnd), readingDate)} ` +
              `${rmStr(r.stub.total)} (${r.stub.kwh} kWh)`
            elec = { amount: r.amount, steps: r.steps, note, slots: [yInvoice.id, yStatement?.id ?? null, null] }
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
            elec = { amount: r.amount, steps: r.steps, note, slots: [yInvoice.id, yStatement?.id ?? null, null] }
          }
        } catch (e) {
          const msg = errMsg(e)
          if (/below/.test(msg)) warnings.push(`Electricity: negative usage. ${msg}`)
          elec = { error: msg }
        }
      }
    }
  }

  return { water, elec, warnings, excluded, photoDocId: wPhoto?.id ?? null }
}
