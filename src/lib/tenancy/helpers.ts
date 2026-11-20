// Pure helpers for the tenancy agreement generator (no browser APIs, unit-tested).
// Dates are plain "yyyy-mm-dd" strings handled as local calendar dates (never new Date(str)).

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = ['', 'Thousand', 'Million', 'Billion']

function under100(n: number): string {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')
}

function under1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (!h) return under100(r)
  return `${ONES[h]} Hundred${r ? ` and ${under100(r)}` : ''}`
}

/** Whole number in words: 3500 → "Three Thousand Five Hundred"; 0 → "Zero". */
export function integerToWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'Zero'
  const groups: number[] = []
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (!g) continue
    // "Three Thousand and Fifty": a trailing group under 100 after a larger group gets "and".
    const words = i === 0 && groups.length > 1 && g < 100 ? `and ${under100(g)}` : under1000(g)
    parts.push(SCALES[i] ? `${words} ${SCALES[i]}` : words)
  }
  return parts.join(' ')
}

/** Parses "3,500.50" / "3500" → 3500.5; empty or invalid → null. */
export function parseAmount(s: string | number | null | undefined): number | null {
  if (s == null) return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = s.replace(/[,\s]/g, '').replace(/^RM/i, '')
  if (!t || !/^\d*(\.\d*)?$/.test(t) || t === '.') return null
  return Number(t)
}

/** Ringgit and sen in words, without the "Ringgit Malaysia … Only" wrapper:
 *  3500 → "Three Thousand Five Hundred"; 3500.5 → "Three Thousand Five Hundred and Fifty Sen". */
export function numberToWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100)
  const ringgit = Math.floor(cents / 100)
  const sen = cents % 100
  const r = integerToWords(ringgit)
  return sen ? `${r} and ${under100(sen)} Sen` : r
}

/** "Ringgit Malaysia Three Thousand Five Hundred Only" (with sen when needed). */
export function ringgitWords(amount: number): string {
  return `Ringgit Malaysia ${numberToWords(amount)} Only`
}

/** 3500 → "3,500.00" */
export function formatRM(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd" */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

// ── Dates ─────────────────────────────────────────────────────────────────────

export interface Ymd { y: number; m: number; d: number } // m = 1..12

export function parseYmd(s: string | null | undefined): Ymd | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return { y, m: mo, d }
}

export function toYmdString({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

function serial({ y, m, d }: Ymd): number {
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

function fromSerial(n: number): Ymd {
  const dt = new Date(n * 86400000)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

export function addDays(date: Ymd, days: number): Ymd {
  return fromSerial(serial(date) + days)
}

/** Adds whole months, clamping the day to the target month (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(date: Ymd, months: number): Ymd {
  const idx = date.y * 12 + (date.m - 1) + months
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-08-25" → "25th August 2026" (upper = "25th AUGUST 2026"); invalid/empty → null. */
export function longDate(s: string | null | undefined, upperMonth = false): string | null {
  const p = parseYmd(s)
  if (!p) return null
  const month = MONTH_NAMES[p.m - 1]
  return `${ordinal(p.d)} ${upperMonth ? month.toUpperCase() : month} ${p.y}`
}

/** Date of birth style: "5 March 1990". */
export function plainLongDate(s: string | null | undefined): string | null {
  const p = parseYmd(s)
  return p ? `${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}` : null
}

// ── Term ↔ dates ─────────────────────────────────────────────────────────────

export interface Term { years: number; months: number; days: number }

/** Last day of a tenancy that starts on `start` and lasts `totalMonths` months (+ `days`). */
export function endDateFrom(start: Ymd, totalMonths: number, days = 0): Ymd {
  const s = addMonths(start, totalMonths)
  // When the day was clamped (e.g. starts 31 Jan, 1 month), the tenancy ends on the clamped day itself.
  const base = s.d === start.d || totalMonths === 0 ? addDays(s, -1) : s
  return addDays(base, days)
}

/** Whole years / months (+ leftover days) between a start date and an inclusive end date. */
export function termBetween(startStr: string, endStr: string): Term | null {
  const start = parseYmd(startStr)
  const end = parseYmd(endStr)
  if (!start || !end || serial(end) < serial(start)) return null
  let months = 0
  // Largest month count whose end date is not after the given end date.
  while (serial(endDateFrom(start, months + 1)) <= serial(end)) months++
  const days = months === 0
    ? serial(end) - serial(start) + 1
    : serial(end) - serial(endDateFrom(start, months))
  return { years: Math.floor(months / 12), months: months % 12, days }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Term text: whole years → "1 ( One ) years"; otherwise "1 year 3 months" (+ " 5 days" if not whole months). */
export function formatTerm(t: Term): string {
  if (t.years > 0 && t.months === 0 && t.days === 0) return `${t.years} ( ${integerToWords(t.years)} ) years`
  const parts: string[] = []
  if (t.years) parts.push(plural(t.years, 'year'))
  if (t.months) parts.push(plural(t.months, 'month'))
  if (t.days) parts.push(plural(t.days, 'day'))
  return parts.join(' ') || '0 months'
}

/** Term text from two "yyyy-mm-dd" dates, or null when either is missing/invalid. */
export function termFromDates(startStr: string, endStr: string): string | null {
  const t = termBetween(startStr, endStr)
  return t ? formatTerm(t) : null
}

/** Reads a typed term: "1 year 3 months", "1 ( One ) years", "18 months", "2 years". null if nothing recognisable. */
export function parseTerm(text: string): Term | null {
  const t = text.toLowerCase()
  const num = (unit: string) => {
    const m = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:\\(\\s*[a-z\\s-]+\\s*\\)\\s*)?${unit}s?\\b`).exec(t)
    return m ? Number(m[1]) : null
  }
  const y = num('year'), mo = num('month'), d = num('day')
  if (y == null && mo == null && d == null) return null
  const totalMonths = Math.round((y ?? 0) * 12 + (mo ?? 0))
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days: Math.round(d ?? 0) }
}

/** End date "yyyy-mm-dd" from a start date and a typed term (start + term - 1 day); null if either is unusable. */
export function endDateFromTerm(startStr: string, termText: string): string | null {
  const start = parseYmd(startStr)
  const t = parseTerm(termText)
  if (!start || !t) return null
  const total = t.years * 12 + t.months
  if (total === 0 && t.days === 0) return null
  if (total === 0) return toYmdString(addDays(start, t.days - 1))
  return toYmdString(endDateFrom(start, total, t.days))
}

// ── Deposits ─────────────────────────────────────────────────────────────────

/** Deposit ÷ rent as a months label: 8000/4000 → "2 months", 2000/4000 → "0.5 month" (singular when ≤ 1). */
export function depositMonthsLabel(deposit: number | null, rent: number | null): string | null {
  if (deposit == null || rent == null || rent <= 0) return null
  const n = Math.round((deposit / rent) * 100) / 100
  return `${n} ${n <= 1 ? 'month' : 'months'}`
}
