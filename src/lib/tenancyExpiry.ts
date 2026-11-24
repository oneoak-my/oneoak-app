// Tenancy expiry overview: one row per unit with its latest expiry, built from check-in records,
// renewal records (records.type = 'renewal') and saved renewals (renewals table). Pure, unit-tested.

import type { PropertyRecord, Renewal, Unit } from './types'

export type ExpirySource = 'checkin' | 'renewal'

export interface ExpiryRow {
  sourceKey: string
  unitId: string
  unitNo: string
  building: string
  expiry: string
  source: ExpirySource
  /** Record that gave the expiry (check-in or renewal record); null for a renewal saved only in the renewals table. */
  record: (PropertyRecord & { unit?: Unit | null }) | null
  /** The chain's check-in record (for actions such as WhatsApp / Renew / Vacate). */
  checkin: (PropertyRecord & { unit?: Unit | null }) | null
  owner: string | null
  tenant: string | null
  rental: number | null
  originalStart: string | null
  coaName: string | null
}

type Rec = PropertyRecord & { unit?: Unit | null }

const ymd = /^\d{4}-\d{2}-\d{2}$/
const d10 = (s: string | null | undefined): string | null => {
  const v = (s ?? '').slice(0, 10)
  return ymd.test(v) ? v : null
}
const minDate = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null
const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

/** Remark key: normalised building + unit ("ooak residence|a-27-09"). */
export function expirySourceKey(building: string | null | undefined, unitNo: string | null | undefined): string {
  const n = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return `${n(building)}|${n(unitNo)}`
}

/** A check-in's expiry: the manual override from this page, else its tenancy end date. */
export const checkinExpiry = (r: PropertyRecord) => d10(r.tenancy_expiry_override) ?? d10(r.tenancy_end_date)
/** A renewal record's expiry: the new tenancy end date. */
export const renewalRecordExpiry = (r: PropertyRecord) => d10(r.renewal_end_date) ?? d10(r.tenancy_end_date)
const checkinStart = (r: PropertyRecord) => d10(r.tenancy_start_date) ?? d10(r.move_in_date)

interface Candidate {
  expiry: string
  start: string | null
  /** For ordering within the unit's history. */
  when: string
  source: ExpirySource
  record: Rec | null
  owner: string | null
  tenant: string | null
  rental: number | null
  coa: string | null
  originalTa: string | null
}

export function buildExpiryRows(input: {
  units: Unit[]
  records: Rec[]
  renewals?: Renewal[]
}): ExpiryRow[] {
  const unitById = new Map(input.units.map((u) => [u.id, u]))
  for (const r of input.records) if (r.unit && !unitById.has(r.unit_id)) unitById.set(r.unit_id, r.unit)
  const byUnit = new Map<string, { checkins: Rec[]; candidates: Candidate[] }>()
  const bucket = (unitId: string) => {
    if (!byUnit.has(unitId)) byUnit.set(unitId, { checkins: [], candidates: [] })
    return byUnit.get(unitId)!
  }

  for (const r of input.records) {
    if (r.type === 'checkin') bucket(r.unit_id).checkins.push(r)
  }
  for (const r of input.records) {
    const b = bucket(r.unit_id)
    if (r.type === 'checkin') {
      const exp = checkinExpiry(r)
      if (exp) b.candidates.push({
        expiry: exp, start: checkinStart(r), when: checkinStart(r) ?? d10(r.date) ?? exp, source: 'checkin', record: r,
        owner: clean(r.landlord_name), tenant: clean(r.tenant_name), rental: r.monthly_rental ?? null, coa: clean(r.co_agent_checkin), originalTa: d10(r.original_ta_date),
      })
    } else if (r.type === 'renewal') {
      const exp = renewalRecordExpiry(r)
      if (exp) b.candidates.push({
        expiry: exp, start: d10(r.renewal_start_date), when: d10(r.renewal_start_date) ?? d10(r.date) ?? exp, source: 'renewal', record: r,
        owner: clean(r.landlord_name), tenant: clean(r.tenant_name), rental: r.monthly_rental ?? null, coa: clean(r.co_agent_checkin) ?? clean(r.co_agent), originalTa: d10(r.original_ta_date),
      })
    }
  }
  for (const n of input.renewals ?? []) {
    const exp = d10(n.tenancy_end_date)
    if (!exp || !n.unit_id) continue
    bucket(n.unit_id).candidates.push({
      expiry: exp, start: d10(n.tenancy_start_date), when: d10(n.tenancy_start_date) ?? d10(n.signing_date) ?? exp, source: 'renewal', record: null,
      owner: clean(n.landlord_name), tenant: clean(n.tenant_name), rental: n.new_rental ?? n.old_rental ?? null, coa: null, originalTa: null,
    })
  }

  const rows: ExpiryRow[] = []
  for (const [unitId, b] of Array.from(byUnit.entries())) {
    if (!b.candidates.length) continue
    const unit = unitById.get(unitId)
    // Latest expiry wins (a renewal after a check-in replaces it).
    const best = [...b.candidates].sort((a, c) => c.expiry.localeCompare(a.expiry) || (a.source === 'renewal' ? -1 : 1))[0]
    // The current chain: the latest check-in that started on/before the winning entry, plus renewals after it.
    const chainCheckin = [...b.checkins]
      .filter((c) => (checkinStart(c) ?? d10(c.date) ?? '') <= best.when)
      .sort((a, c) => (checkinStart(c) ?? d10(c.date) ?? '').localeCompare(checkinStart(a) ?? d10(a.date) ?? ''))[0] ?? null
    const chainFrom = chainCheckin ? (checkinStart(chainCheckin) ?? d10(chainCheckin.date) ?? '') : ''
    const chain = b.candidates.filter((c) => c.when >= chainFrom)
    const originalStart = minDate([...chain.map((c) => c.start), ...chain.map((c) => c.originalTa)])
    const owner = best.owner ?? [...chain].reverse().map((c) => c.owner).find(Boolean) ?? null
    const coa = best.coa ?? (chainCheckin ? clean(chainCheckin.co_agent_checkin) : null)
    rows.push({
      sourceKey: expirySourceKey(unit?.building, unit?.unit_number),
      unitId,
      unitNo: unit?.unit_number ?? '',
      building: unit?.building ?? '',
      expiry: best.expiry,
      source: best.source,
      record: best.record,
      checkin: chainCheckin,
      owner,
      tenant: best.tenant ?? (chainCheckin ? clean(chainCheckin.tenant_name) : null),
      rental: best.rental,
      originalStart,
      coaName: coa,
    })
  }
  return rows.sort((a, b) => a.expiry.localeCompare(b.expiry) || a.unitNo.localeCompare(b.unitNo))
}

/** Rows whose expiry is within [from, to] (inclusive), soonest first; expired ones (before today) only when asked. */
export function filterExpiryRows(rows: ExpiryRow[], from: string, to: string, today: string, includeExpired: boolean): ExpiryRow[] {
  return rows
    .filter((r) => (r.expiry < today ? includeExpired && r.expiry <= to : r.expiry >= from && r.expiry <= to))
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.unitNo.localeCompare(b.unitNo))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-12-01" → "1 Dec 2026" */
export function shortDate(s: string | null | undefined): string {
  const v = d10(s)
  if (!v) return ''
  const [y, m, d] = v.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "1 Dec 2026" when from = to, else "1 Dec 2026 - 28 Feb 2027". */
export function rangeLabel(from: string, to: string): string {
  return from === to ? shortDate(from) : `${shortDate(from)} - ${shortDate(to)}`
}

/** Local today + n months ("yyyy-mm-dd"), day clamped to the month end. */
export function addMonthsYmd(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12), nm = idx % 12
  const last = new Date(ny, nm + 1, 0).getDate()
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export function todayYmdLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const formatRental = (n: number | null) =>
  n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
