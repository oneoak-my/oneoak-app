// Contractor invoice / quotation reading: pure rules over text from pdfText.ts or ocr.ts.
// Free: no AI, no server. Quotations are treated exactly like invoices.
// Bank details are never read from documents: they come only from the app's saved providers.

import type { PaymentBy, RecordType, Service, ServiceDescription, ServiceProvider } from './types'
import { findUnitCode } from './utilityDocs'

export type ContractorVendor = 'cuciclan' | 'edmia' | 'kslee'

export type ContractorItem = { description: string; amount: number }

export type ContractorDoc = {
  vendor: ContractorVendor | null
  vendorName: string | null
  docNo: string | null
  /** YYYY-MM-DD */
  date: string | null
  /** Unit code as printed, e.g. "B 21-3a" or "A-17-3A" (compare with normaliseUnit/unitsMatch). */
  unitNo: string | null
  total: number | null
  items: ContractorItem[]
  /** Fixed service description for the vendor (looked up in service_descriptions by the UI). */
  targetDescription: string | null
  warnings: string[]
}

const VENDORS: Record<ContractorVendor, { name: string; detect: RegExp; provider: RegExp }> = {
  cuciclan: { name: 'The Cuci Clan', detect: /cuci\s*clan|cuciclan|ca0334277/i, provider: /cuci\s*clan|cuciclan/i },
  edmia: { name: 'ED MIA Trading', detect: /ed\s*mia\s*trading|edmia|002999890/i, provider: /ed\s*mia/i },
  kslee: { name: 'KSLee Enterprise', detect: /ks\s*lee\s*enterprise|kslee|001854312/i, provider: /ks\s*lee/i },
}

export function detectVendor(text: string): ContractorVendor | null {
  for (const v of Object.keys(VENDORS) as ContractorVendor[]) if (VENDORS[v].detect.test(text)) return v
  if (/air\s*cond\s*service/i.test(text)) return 'kslee'
  return null
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : null
const monthNo = (s: string) => MONTHS[s.toLowerCase().slice(0, 3)] ?? 0

/** First date in a string: 13/11/2026, 11-Nov-2026, 28 Oct 2026, Oct 28th ,2026. */
export function findDate(s: string): string | null {
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return iso(+m[3], +m[2], +m[1])
  m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{4})/)
  if (m && monthNo(m[2])) return iso(+m[3], monthNo(m[2]), +m[1])
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})/)
  if (m && monthNo(m[1])) return iso(+m[3], monthNo(m[1]), +m[2])
  return null
}

const AMOUNT = '(\\d{1,3}(?:,\\d{3})*\\.\\d{2}|\\d+\\.\\d{2})'
const toAmount = (s: string) => Number(s.replace(/,/g, ''))
const cents = (n: number) => Math.round(n * 100)
const rm = (n: number) => `RM ${n.toFixed(2)}`

// ── Field extraction ──────────────────────────────────────────────────────────

function findDocNo(lines: string[]): string | null {
  const id = '([A-Za-z0-9][A-Za-z0-9_/-]*)'
  const patterns = [
    new RegExp(`Invoice\\s*(?:No\\.?|#|Number)\\s*[:.]?\\s*${id}`, 'i'),
    new RegExp(`Quotation\\s*(?:No\\.?|#|Number)\\s*[:.]?\\s*${id}`, 'i'),
    new RegExp(`Bill\\s*No\\.?\\s*[:.]?\\s*${id}`, 'i'),
    new RegExp(`(?:^|\\s)No\\.?\\s*:\\s*${id}`, 'i'),
  ]
  for (const re of patterns) {
    for (const l of lines) {
      const m = l.match(re)
      if (m) return m[1]
    }
  }
  return null
}

function findDocDate(lines: string[]): string | null {
  for (const l of lines) {
    const i = l.search(/date/i)
    if (i < 0) continue
    const d = findDate(l.slice(i))
    if (d) return d
  }
  for (const l of lines) {
    const d = findDate(l)
    if (d) return d
  }
  return null
}

/** Prefers "Total Payable", then Grand Total / Amount Due, then the last plain "Total" (never "Sub Total"). */
function findTotal(lines: string[]): number | null {
  const labelled = [/Total\s*Payable/i, /Grand\s*Total/i, /Amount\s*Due/i]
  for (const label of labelled) {
    for (const l of lines) {
      const m = l.match(new RegExp(`${label.source}\\s*:?\\s*(?:RM)?\\s*${AMOUNT}`, 'i'))
      if (m) return toAmount(m[1])
    }
  }
  let found: number | null = null
  for (const l of lines) {
    if (/sub\s*-?\s*total/i.test(l)) continue
    const m = l.match(new RegExp(`(?:^|[^A-Za-z])Total\\s*:?\\s*(?:RM)?\\s*${AMOUNT}`, 'i'))
    if (m) found = toAmount(m[1]) // the last plain "Total" wins
  }
  return found
}

const UNIT_LABEL = /\b(bill(?:ing)?\s*to|quotation\s*for|invoice\s*to)\b\s*:?/i
const BUILDING_HINT = /OOAK|THE\s*OAK|KIARA/i
const NOT_UNIT_LINE = /invoice|quotation|\bno\b\.?\s*[:.]|#|date|tel|phone|fax|h\/p|reg|ssm|sdn|bhd|enterprise|trading/i

function findUnit(lines: string[]): string | null {
  // 1) After "Bill to" / "Billing to" / "Quotation for" / "Invoice to": same line, else the next lines.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(UNIT_LABEL)
    if (!m || m.index == null) continue
    const same = findUnitCode(lines[i].slice(m.index + m[0].length))
    if (same) return same
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
      const c = findUnitCode(lines[j])
      if (c) return c
    }
  }
  // 2) A line naming the building ("A-22-06 THE OOAK / MONT KIARA").
  for (const l of lines) {
    if (!BUILDING_HINT.test(l)) continue
    const c = findUnitCode(l)
    if (c) return c
  }
  // 3) Top of the page, skipping header lines (document numbers, phones, company numbers).
  for (const l of lines.slice(0, 15)) {
    if (NOT_UNIT_LINE.test(l)) continue
    const c = findUnitCode(l)
    if (c) return c
  }
  return null
}

const NOT_ITEM = /total|payable|deposit|balance|tax|rounding|discount|paid|ringgit|amount\s*due/i

function findItems(lines: string[]): ContractorItem[] {
  // "Description | Qty | Price | Amount" rows are recognised anywhere (Cuci Clan prints its
  // "Total Payable" above the items). "Description | Amount" rows (ED MIA) only inside a table
  // that starts at a DESCRIPTION/ITEM header and ends at the first total line after it.
  const header = lines.findIndex((l) => /\b(description|item|particulars)\b/i.test(l) && !/\d+\.\d{2}/.test(l))
  let tableEnd = -1
  if (header >= 0) {
    tableEnd = lines.length
    for (let i = header + 1; i < lines.length; i++) {
      if (/\b(sub\s*-?\s*total|total|ringgit)\b/i.test(lines[i])) { tableEnd = i; break }
    }
  }

  const items: ContractorItem[] = []
  const qtyPriceAmount = new RegExp(`^(.*?[A-Za-z].*?)\\s+\\d+(?:\\.\\d+)?\\s+(?:RM\\s*)?${AMOUNT}\\s+(?:RM\\s*)?${AMOUNT}$`, 'i')
  const descAmount = new RegExp(`^(.*?[A-Za-z].*?)\\s+(?:RM\\s*)?${AMOUNT}$`, 'i')
  for (let i = header >= 0 ? header + 1 : 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l || NOT_ITEM.test(l)) continue
    const a = l.match(qtyPriceAmount)
    if (a) { items.push({ description: a[1].trim(), amount: toAmount(a[3]) }); continue }
    if (i < tableEnd) {
      const b = l.match(descAmount)
      if (b) { items.push({ description: b[1].trim(), amount: toAmount(b[2]) }); continue }
      // A wrapped line such as "(2.5 HOURS X 2 CLEANERS)" belongs to the item above.
      if (items.length && !/\d+\.\d{2}/.test(l)) items[items.length - 1].description += ` ${l}`
    }
  }
  return items
}

/** The vendor's fixed service description (exact names in service_descriptions). */
function targetDescriptionFor(vendor: ContractorVendor | null, items: ContractorItem[], lines: string[]): string | null {
  if (vendor === 'cuciclan') return 'Steam Cleaning'
  if (vendor === 'kslee') return 'Air cond Services'
  if (vendor === 'edmia') {
    // Look for "steam" in the item lines; the whole text only if no items could be read.
    const where = items.length ? items.map((i) => i.description) : lines
    return where.some((l) => /steam/i.test(l)) ? 'Deep Clean & Steam Clean' : 'Deep Cleaning'
  }
  return null
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseContractorText(text: string): ContractorDoc {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const warnings: string[] = []
  const vendor = detectVendor(text)
  const total = findTotal(lines)
  const items = findItems(lines)

  const doc: ContractorDoc = {
    vendor,
    vendorName: vendor ? VENDORS[vendor].name : null,
    docNo: findDocNo(lines),
    date: findDocDate(lines),
    unitNo: findUnit(lines),
    total,
    items,
    targetDescription: targetDescriptionFor(vendor, items, lines),
    warnings,
  }

  if (!lines.length) warnings.push('No text could be read from this file: fill in the fields by hand')
  else if (!vendor) warnings.push('Contractor not recognised: pick the provider and description')
  if (total == null) warnings.push('Total not found: type the amount')
  if (!doc.unitNo) warnings.push('No unit number found on the document')
  if (items.length && total != null) {
    const sum = items.reduce((s, i) => s + cents(i.amount), 0)
    if (sum !== cents(total)) warnings.push(`Items add up to ${rm(sum / 100)} but the total is ${rm(total)}`)
  }
  return doc
}

// ── Matching against the app's own data ──────────────────────────────────────

/** Provider row for the detected vendor, else any saved provider whose name appears in the text. */
export function matchProvider(vendor: ContractorVendor | null, text: string, providers: ServiceProvider[]): ServiceProvider | null {
  if (vendor) {
    const p = providers.find((x) => VENDORS[vendor].provider.test(x.name))
    if (p) return p
  }
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const hay = ` ${flat(text)} `
  let best: ServiceProvider | null = null
  for (const p of providers) {
    const n = flat(p.name)
    if (n.length >= 4 && hay.includes(` ${n} `) && (!best || n.length > flat(best.name).length)) best = p
  }
  return best
}

/** "ED MIA TRADING · Maybank 5643 9712 5454" from the app's saved provider record. */
export function providerBankText(p: Pick<ServiceProvider, 'name' | 'bank_name' | 'bank_account'>): string {
  const bank = [p.bank_name, p.bank_account].filter((x) => x && x.trim()).join(' ')
  return `${p.name} · ${bank || 'no bank details saved'}`
}

/** Case-insensitive; "&" = "and"; extra spaces and punctuation ignored. */
export function normDescription(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function findDescription(name: string, list: ServiceDescription[]): ServiceDescription | null {
  const want = normDescription(name)
  return list.find((d) => normDescription(d.description) === want) ?? null
}

const STOP = new Set(['and', 'the', 'for', 'with', 'service', 'services', 'charge', 'charges', 'fee', 'fees'])

/** Other vendors: the description sharing the most meaningful words with the document. */
export function keywordDescription(text: string, list: ServiceDescription[]): ServiceDescription | null {
  const hay = ` ${normDescription(text)} `
  let best: ServiceDescription | null = null
  let bestScore = 0
  for (const d of list) {
    const words = normDescription(d.description).split(' ').filter((w) => w.length >= 4 && !STOP.has(w))
    const score = words.filter((w) => hay.includes(` ${w} `)).length
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

/** An existing service on this record with the same provider, description and amount. */
export function findDuplicate(
  services: Pick<Service, 'id' | 'provider_id' | 'description' | 'amount'>[],
  providerId: string | null,
  description: string,
  amount: number | null,
): Pick<Service, 'id' | 'provider_id' | 'description' | 'amount'> | null {
  if (!providerId || !description || amount == null) return null
  return services.find((s) =>
    s.provider_id === providerId &&
    normDescription(s.description) === normDescription(description) &&
    cents(s.amount ?? 0) === cents(amount),
  ) ?? null
}

/** Same rule as the Add Service form: check-out deducts from the deposit, everything else is paid by the owner. */
export function defaultPaymentBy(recordType: RecordType): PaymentBy {
  return recordType === 'checkout' ? 'Deduct from Deposit' : 'Pay by Owner'
}

/** The service row to create: notes stay empty so WhatsApp reports stay short. */
export function contractorServicePayload(args: {
  recordId: string
  recordType: RecordType
  description: string
  providerId: string | null
  amount: number
  paymentBy?: PaymentBy
}): Pick<Service, 'record_id' | 'description' | 'provider_id' | 'amount' | 'payment_by' | 'notes'> {
  return {
    record_id: args.recordId,
    description: args.description,
    provider_id: args.providerId,
    amount: args.amount,
    payment_by: args.paymentBy ?? defaultPaymentBy(args.recordType),
    notes: null,
  }
}
