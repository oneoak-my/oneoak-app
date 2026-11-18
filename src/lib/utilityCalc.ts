// Utility (water / electricity) settlement calculations for check-in and check-out.
// Pure functions: no UI, no network.
//
// Conventions
// - Dates are 'YYYY-MM-DD' strings, parsed as LOCAL dates (never new Date(str)).
// - Money is summed in integer cents; results are rounded half-up to 2 decimals.
// - Problems that make a result impossible (missing reading, negative usage) throw
//   UtilityCalcError. Things the user should double-check go in `warnings`.

export class UtilityCalcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UtilityCalcError'
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) throw new UtilityCalcError(`Invalid date "${dateStr}" (expected YYYY-MM-DD)`)
  return new Date(y, m - 1, d)
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Normalised 'YYYY-MM-DD' so string comparison is date comparison. */
function ymd(dateStr: string): string {
  return toYmd(parseLocalDate(dateStr))
}

function firstOfMonth(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return toYmd(new Date(d.getFullYear(), d.getMonth(), 1))
}

function lastOfMonth(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return toYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

function monthLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function dayLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Sep 2026" for a calendar month, otherwise "15 Aug 2026 – 14 Sep 2026". */
function periodLabel(start: string, end: string): string {
  if (ymd(start) === firstOfMonth(start) && ymd(end) === lastOfMonth(start)) return monthLabel(start)
  return `${dayLabel(start)} – ${dayLabel(end)}`
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return ymd(aStart) <= ymd(bEnd) && ymd(aEnd) >= ymd(bStart)
}

// ── Money helpers ─────────────────────────────────────────────────────────────

/** Round half-up (away from zero) to 2 decimals. Tolerates float noise like 1.005. */
export function round2(x: number): number {
  return (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-7)) / 100
}

function toCents(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-7)
}

function fromCents(c: number): number {
  return c / 100
}

function rm(amount: number): string {
  const s = Math.abs(amount).toFixed(2)
  return amount < 0 ? `-RM ${s}` : `RM ${s}`
}

function rmCents(c: number): string {
  return rm(fromCents(c))
}

// ══ WATER (Ooak Residence / Ooak Suites management statement) ═════════════════

export type WaterRow = {
  invoiceNo: string
  periodStart: string
  periodEnd: string
  amount: number
  paid: number
  outstanding: number
}

export type WaterPeriod = { start: string; end: string; outstanding: number }

const WATER_RATE = 3.83 // RM per m³ above the minimum charge

/**
 * Groups statement rows by billing period. Where a period was invoiced more than
 * once (e.g. a re-issued bill), payments on one invoice offset the other:
 * outstanding = max(0, Σ outstanding − Σ paid). A single invoice keeps its printed outstanding.
 */
export function netWaterRows(rows: WaterRow[]): { periods: WaterPeriod[]; notes: string[] } {
  const groups = new Map<string, WaterRow[]>()
  for (const r of rows) {
    const key = `${ymd(r.periodStart)}|${ymd(r.periodEnd)}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }

  const periods: WaterPeriod[] = []
  const notes: string[] = []
  const keys = Array.from(groups.keys()).sort()
  for (const key of keys) {
    const g = groups.get(key)!
    const [start, end] = key.split('|')
    if (g.length === 1) {
      periods.push({ start, end, outstanding: fromCents(toCents(g[0].outstanding)) })
      continue
    }
    const outC = g.reduce((s, r) => s + toCents(r.outstanding), 0)
    const paidC = g.reduce((s, r) => s + toCents(r.paid), 0)
    const netC = Math.max(0, outC - paidC)
    periods.push({ start, end, outstanding: fromCents(netC) })
    notes.push(`${periodLabel(start, end)}: ${g.length} invoices, ${rmCents(paidC)} already paid netted off`)
  }
  return { periods, notes }
}

/** Bill for metered usage: minimum charge, or usage × RM 3.83 above the minimum band. */
export function waterBill(usageM3: number, dualKey: boolean): number {
  if (dualKey) return usageM3 <= 3 ? 12 : round2(usageM3 * WATER_RATE)
  return usageM3 <= 6 ? 24 : round2(usageM3 * WATER_RATE)
}

/**
 * Check-in: arrears for periods ending before the move-in month, plus half the
 * move-in month's minimum charge when moving in on/after the 14th.
 */
export function waterCheckIn(args: {
  rows: WaterRow[]
  moveInDate: string
  dualKey: boolean
}): { amount: number; steps: string[] } {
  const { rows, moveInDate, dualKey } = args
  const monthStart = firstOfMonth(moveInDate)
  const { periods, notes } = netWaterRows(rows)
  const steps: string[] = [...notes]

  let totalC = 0
  for (const p of periods) {
    if (p.end < monthStart && p.outstanding !== 0) {
      totalC += toCents(p.outstanding)
      steps.push(`${periodLabel(p.start, p.end)} outstanding: ${rm(p.outstanding)}`)
    }
  }
  steps.push(`Outstanding before ${monthLabel(moveInDate)}: ${rmCents(totalC)}`)

  const day = parseLocalDate(moveInDate).getDate()
  if (day >= 14) {
    const half = dualKey ? 6 : 12
    totalC += toCents(half)
    steps.push(`Move-in on day ${day} (≥ 14): add ${rm(half)}${dualKey ? ' (dual-key)' : ''}`)
  } else {
    steps.push(`Move-in on day ${day} (< 14): nothing added for ${monthLabel(moveInDate)}`)
  }

  steps.push(`Total: ${rmCents(totalC)}`)
  return { amount: fromCents(totalC), steps }
}

/**
 * Check-out: outstanding periods within the tenancy, plus — if the statement has no
 * bill yet for the move-out month — a bill for usage since the latest invoice reading.
 */
export function waterCheckOut(args: {
  rows: WaterRow[]
  tenancyStart: string
  moveOutDate: string
  dualKey: boolean
  latestInvoice?: { periodEnd: string; currentReading: number }
  photoReading?: number
}): { amount: number; steps: string[]; warnings: string[] } {
  const { rows, tenancyStart, moveOutDate, dualKey, latestInvoice, photoReading } = args
  const start = ymd(tenancyStart)
  const out = ymd(moveOutDate)
  const { periods, notes } = netWaterRows(rows)
  const steps: string[] = [...notes]
  const warnings: string[] = []

  let totalC = 0
  for (const p of periods) {
    if (p.end >= start && p.start <= out && p.outstanding !== 0) {
      totalC += toCents(p.outstanding)
      steps.push(`${periodLabel(p.start, p.end)} outstanding: ${rm(p.outstanding)}`)
    }
  }
  steps.push(`Outstanding in tenancy (${dayLabel(start)} – ${dayLabel(out)}): ${rmCents(totalC)}`)

  const moStart = firstOfMonth(out)
  const moEnd = lastOfMonth(out)
  const covered = rows.some((r) => overlaps(r.periodStart, r.periodEnd, moStart, moEnd))
  if (covered) {
    steps.push(`${monthLabel(out)} is already billed on the statement: nothing extra added`)
  } else {
    if (photoReading == null || !latestInvoice) {
      throw new UtilityCalcError(
        `No bill covers ${monthLabel(out)} yet: the meter photo reading and the latest invoice reading are required`,
      )
    }
    const usage = photoReading - latestInvoice.currentReading
    if (usage < 0) {
      throw new UtilityCalcError(
        `Photo reading ${photoReading} is below the latest invoice reading ${latestInvoice.currentReading}`,
      )
    }
    const bill = waterBill(usage, dualKey)
    totalC += toCents(bill)
    steps.push(
      `Usage since invoice ending ${dayLabel(latestInvoice.periodEnd)}: ${photoReading} − ${latestInvoice.currentReading} = ${usage} m³`,
    )
    const isMinimum = usage <= (dualKey ? 3 : 6)
    steps.push(
      `Bill for ${usage} m³${dualKey ? ' (dual-key)' : ''}: ${rm(bill)}` +
        (isMinimum ? ' (minimum charge)' : ` (${usage} × RM ${WATER_RATE.toFixed(2)})`),
    )
  }

  steps.push(`Total: ${rmCents(totalC)}`)
  return { amount: fromCents(totalC), steps, warnings }
}

// ══ ELECTRICITY (YNH Utility) ═════════════════════════════════════════════════

export type ElecRates = {
  energy: number
  capacity: number
  network: number
  /** Energy Efficiency Incentive: negative on the invoice, e.g. -0.1100 */
  eei: number
  afa: number
}

export type ElecInvoice = {
  periodStart: string
  periodEnd: string
  previousReading: number
  currentReading: number
  rates: ElecRates
  retailCharge: number
  /** 0.016 for "1.60%" */
  rePct: number
  outstandingBF: number
  currentCharges: number
  payable: number
}

/** Credits/receipts are negative and tied to the month they were paid for. */
export type ElecLedgerRow = {
  periodStart: string | null
  periodEnd: string | null
  outstanding: number
}

export type ElecProRate = {
  kwh: number
  energy: number
  capacity: number
  network: number
  eei: number
  afa: number
  charges: number
  retail: number
  subtotal: number
  re: number
  total: number
  steps: string[]
}

const fmt4 = (x: number) => x.toFixed(4)

/**
 * Bill for `kwh` at the invoice's rates. Nothing is rounded until the final total.
 * RE fund applies to energy + capacity + network + EEI; AFA is excluded (verified on a real invoice).
 */
export function proRateElectricity(
  kwh: number,
  rates: ElecRates,
  retailCharge: number,
  rePct: number,
): ElecProRate {
  const energy = kwh * rates.energy
  const capacity = kwh * rates.capacity
  const network = kwh * rates.network
  const eei = kwh * rates.eei
  const afa = kwh * rates.afa
  const charges = energy + capacity + network + eei + afa
  const retail = retailCharge * 0.5
  const subtotal = charges + retail
  const re = rePct * (energy + capacity + network + eei)
  const total = round2(subtotal + re)

  const steps = [
    `Energy: ${kwh} kWh × ${fmt4(rates.energy)} = ${fmt4(energy)}`,
    `Capacity: ${kwh} kWh × ${fmt4(rates.capacity)} = ${fmt4(capacity)}`,
    `Network: ${kwh} kWh × ${fmt4(rates.network)} = ${fmt4(network)}`,
    `EEI: ${kwh} kWh × ${fmt4(rates.eei)} = ${fmt4(eei)}`,
    `AFA: ${kwh} kWh × ${fmt4(rates.afa)} = ${fmt4(afa)}`,
    `Charges: ${fmt4(charges)}`,
    `Retail: ${retailCharge.toFixed(2)} × 0.5 = ${fmt4(retail)}`,
    `Subtotal: ${fmt4(subtotal)}`,
    `RE ${(rePct * 100).toFixed(2)}% × (energy + capacity + network + EEI) = ${fmt4(re)}`,
    `Total: ${fmt4(subtotal + re)} → ${rm(total)}`,
  ]
  return { kwh, energy, capacity, network, eei, afa, charges, retail, subtotal, re, total, steps }
}

function stubFrom(invoice: ElecInvoice, readingAsOf: number, label: string): ElecProRate {
  const kwh = readingAsOf - invoice.currentReading
  if (kwh < 0) {
    throw new UtilityCalcError(
      `Meter reading ${readingAsOf} is below the invoice's current reading ${invoice.currentReading}`,
    )
  }
  const p = proRateElectricity(kwh, invoice.rates, invoice.retailCharge, invoice.rePct)
  p.steps.unshift(`${label}: ${readingAsOf} − ${invoice.currentReading} = ${kwh} kWh since invoice ending ${dayLabel(invoice.periodEnd)}`)
  return p
}

/**
 * Check-in: everything owed before the move-in month, plus the usage from the
 * invoice's closing reading up to the move-in reading (landlord's share).
 */
export function elecCheckIn(args: {
  invoice: ElecInvoice
  ledger?: ElecLedgerRow[]
  moveInDate: string
  readingAsOf: number
}): { amount: number; before: number; stub: ElecProRate; steps: string[]; warnings: string[] } {
  const { invoice, ledger, moveInDate, readingAsOf } = args
  const monthStart = firstOfMonth(moveInDate)
  const steps: string[] = []
  const warnings: string[] = []

  let beforeC = 0
  if (ledger) {
    for (const r of ledger) {
      if (!r.periodEnd) {
        warnings.push(`Ledger row of ${rm(r.outstanding)} has no period: skipped`)
        continue
      }
      if (ymd(r.periodEnd) < monthStart) {
        beforeC += toCents(r.outstanding)
        const label = r.periodStart ? periodLabel(r.periodStart, r.periodEnd) : `to ${dayLabel(r.periodEnd)}`
        steps.push(`${label}: ${rm(r.outstanding)}`)
      }
    }
    steps.push(`Ledger total before ${monthLabel(moveInDate)}: ${rmCents(beforeC)}`)
  } else {
    beforeC = toCents(invoice.payable)
    steps.push(`Invoice payable (${periodLabel(invoice.periodStart, invoice.periodEnd)}): ${rm(invoice.payable)}`)
    if (ymd(invoice.periodEnd) >= monthStart) {
      warnings.push(
        `Invoice period ends ${dayLabel(invoice.periodEnd)}, not before ${monthLabel(moveInDate)}: payable may include the tenant's month`,
      )
    }
  }

  const stub = stubFrom(invoice, readingAsOf, 'Usage to move-in (landlord)')
  steps.push(...stub.steps)

  const totalC = beforeC + toCents(stub.total)
  steps.push(`Total: ${rmCents(beforeC)} + ${rm(stub.total)} = ${rmCents(totalC)}`)
  return { amount: fromCents(totalC), before: fromCents(beforeC), stub, steps, warnings }
}

/**
 * Check-out: the tenant's share of the ledger (rows within the tenancy), plus the
 * usage since the latest invoice unless that invoice already covers the move-out month.
 */
export function elecCheckOut(args: {
  invoice: ElecInvoice
  ledger?: ElecLedgerRow[]
  tenancyStart: string
  moveOutDate: string
  readingAsOf?: number
}): { amount: number; tenantPart: number; stub: ElecProRate | null; steps: string[]; warnings: string[] } {
  const { invoice, ledger, tenancyStart, moveOutDate, readingAsOf } = args
  const start = ymd(tenancyStart)
  const out = ymd(moveOutDate)
  const steps: string[] = []
  const warnings: string[] = []

  let tenantC = 0
  if (ledger) {
    const firstMonth = firstOfMonth(start)
    const lastMonth = firstOfMonth(out)
    for (const r of ledger) {
      if (!r.periodStart && !r.periodEnd) {
        warnings.push(`Ledger row of ${rm(r.outstanding)} has no period: skipped`)
        continue
      }
      const pStart = r.periodStart ?? r.periodEnd!
      const pEnd = r.periodEnd ?? r.periodStart!
      let include: boolean
      if (r.outstanding < 0) {
        // Credit: counts only if the month it was paid for is inside the tenancy.
        const m = firstOfMonth(pStart)
        include = m >= firstMonth && m <= lastMonth
      } else {
        include = overlaps(pStart, pEnd, start, out)
      }
      if (include) {
        tenantC += toCents(r.outstanding)
        steps.push(`${periodLabel(pStart, pEnd)}: ${rm(r.outstanding)}`)
      }
    }
    steps.push(`Tenant part (${dayLabel(start)} – ${dayLabel(out)}): ${rmCents(tenantC)}`)
  } else {
    tenantC = toCents(invoice.outstandingBF) + toCents(invoice.currentCharges)
    steps.push(
      `Invoice B/F ${rm(invoice.outstandingBF)} + current charges ${rm(invoice.currentCharges)} = ${rmCents(tenantC)}`,
    )
    warnings.push('No ledger: tenancy period not verified')
  }

  let stub: ElecProRate | null = null
  const moStart = firstOfMonth(out)
  const moEnd = lastOfMonth(out)
  if (overlaps(invoice.periodStart, invoice.periodEnd, moStart, moEnd)) {
    steps.push(`Invoice already covers ${monthLabel(out)}: no extra usage added`)
    if (out !== moEnd) {
      warnings.push(
        `Move-out on ${dayLabel(out)} is mid-month, but the invoice bills to ${dayLabel(invoice.periodEnd)}`,
      )
    }
  } else {
    if (readingAsOf == null) {
      throw new UtilityCalcError(`No invoice covers ${monthLabel(out)} yet: the move-out meter reading is required`)
    }
    stub = stubFrom(invoice, readingAsOf, 'Usage to move-out (tenant)')
    steps.push(...stub.steps)
  }

  const totalC = tenantC + (stub ? toCents(stub.total) : 0)
  steps.push(`Total: ${rmCents(totalC)}`)
  return { amount: fromCents(totalC), tenantPart: fromCents(tenantC), stub, steps, warnings }
}
