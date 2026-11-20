// Puts values read from dropped documents into the draft's normal boxes (pure; unit-tested).
// Each result lists what was found, where it went (with the file name for the "Read from" tag),
// warnings, and choices left to the user (pending) instead of guessing.

import type { TenancyData } from './types'
import { emptyLandlord, newId } from './types'
import { formatRM, longDate, termFromDates } from './helpers'
import {
  idTypeOf, landlordItemsClause, normaliseId, sameId, sameName,
  type AtrResult, type BankAddressResult, type Party, type PassportResult,
} from './docParsers'

export interface Finding { label: string; value: string; target: string; big?: boolean }

export type AddressTarget = 'allLandlords' | 'premises' | `landlord:${number}`

export type Pending =
  | { kind: 'landlords'; incoming: Party[]; sourceLabel: string; diffs: string[] }
  | { kind: 'passportTenant'; passport: PassportResult; reason: 'choose' | 'mismatch'; tenantIndex?: number; existingNo?: string }
  | { kind: 'clause'; margin: string; text: string }
  | { kind: 'address'; address: string; target: AddressTarget }

export interface ApplyResult {
  data: TenancyData
  findings: Finding[]
  warnings: string[]
  /** field path → file name, for the "Read from <file>" tags */
  sources: Record<string, string>
  pending: Pending[]
}

const clone = (d: TenancyData): TenancyData => JSON.parse(JSON.stringify(d))

function start(d: TenancyData): ApplyResult {
  return { data: clone(d), findings: [], warnings: [], sources: {}, pending: [] }
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj)
}

function setPath(obj: unknown, path: string, value: unknown) {
  const keys = path.split('.')
  let o = obj as Record<string, unknown>
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>
  o[keys[keys.length - 1]] = value
}

/** Sets one box, records where it came from, and notes when a different typed value was replaced. */
function put(r: ApplyResult, file: string, path: string, value: string, label: string, target: string, big = false, shown?: string) {
  const prev = getPath(r.data, path)
  if (typeof prev === 'string' && prev.trim() && prev.trim() !== value.trim()) {
    r.warnings.push(`${target}: replaced "${prev.trim()}" with "${value}".`)
  }
  setPath(r.data, path, value)
  r.sources[path] = file
  r.findings.push({ label, value: shown ?? value, target, big })
}

const amountText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

// ── Landlords (Agreement to Rent or landlord-names picture) ──────────────────

export function applyLandlords(d: TenancyData, incoming: Party[], file: string, sourceLabel: string, force = false): ApplyResult {
  const r = start(d)
  if (!incoming.length) return r
  const existing = r.data.landlords
  const allEmpty = existing.every((l) => !l.name.trim() && !l.idNo.trim())
  const sameNames = existing.length === incoming.length && incoming.every((p, i) => sameName(p.name, existing[i].name))
  if (allEmpty || force) {
    r.data.landlords = incoming.map((p, i) => ({ ...emptyLandlord(), address: existing[i]?.address ?? '' }))
    incoming.forEach((p, i) => {
      put(r, file, `landlords.${i}.name`, p.name, 'Landlord name', `Landlord ${i + 1} name`)
      if (p.idNo) {
        setPath(r.data, `landlords.${i}.idType`, idTypeOf(p.idNo))
        put(r, file, `landlords.${i}.idNo`, normaliseId(p.idNo), 'Landlord ID no.', `Landlord ${i + 1} ID no.`, true)
      }
    })
    return r
  }
  if (sameNames) {
    incoming.forEach((p, i) => {
      const cur = existing[i]
      if (!p.idNo) return
      if (!cur.idNo.trim()) {
        setPath(r.data, `landlords.${i}.idType`, idTypeOf(p.idNo))
        put(r, file, `landlords.${i}.idNo`, normaliseId(p.idNo), 'Landlord ID no.', `Landlord ${i + 1} ID no.`, true)
      } else if (!sameId(cur.idNo, p.idNo)) {
        r.warnings.push(`Landlord ${i + 1} (${cur.name}): ID ${cur.idNo} in the form, ${normaliseId(p.idNo)} in ${sourceLabel}.`)
      }
    })
    r.findings.push({ label: 'Landlords', value: incoming.map((p) => p.name).join(', '), target: 'Same names as already in the form' })
    return r
  }
  const diffs: string[] = []
  const n = Math.max(existing.length, incoming.length)
  for (let i = 0; i < n; i++) {
    const a = existing[i], b = incoming[i]
    if (!a) diffs.push(`Landlord ${i + 1}: not in the form; ${sourceLabel} has ${b.name}${b.idNo ? ` (${b.idNo})` : ''}`)
    else if (!b) diffs.push(`Landlord ${i + 1}: ${a.name} in the form; not in ${sourceLabel}`)
    else if (!sameName(a.name, b.name) || (a.idNo && b.idNo && !sameId(a.idNo, b.idNo))) {
      diffs.push(`Landlord ${i + 1}: form "${a.name}${a.idNo ? ` (${a.idNo})` : ''}" vs ${sourceLabel} "${b.name}${b.idNo ? ` (${b.idNo})` : ''}"`)
    }
  }
  r.warnings.push(`Landlords differ from what is already in the form; nothing was changed. Tick "Use ${sourceLabel}" to replace them.`)
  r.pending.push({ kind: 'landlords', incoming, sourceLabel, diffs })
  return r
}

// ── Agreement to Rent ────────────────────────────────────────────────────────

export function applyAtr(d: TenancyData, a: AtrResult, file: string): ApplyResult {
  const r = start(d)
  if (a.premises) put(r, file, 'premises', a.premises, 'Property address', 'Premises address')
  if (a.monthlyRent != null) put(r, file, 'monthlyRent', amountText(a.monthlyRent), 'Monthly rental', 'Monthly rental', false, `RM ${formatRM(a.monthlyRent)}`)
  if (a.securityDeposit != null) put(r, file, 'securityDeposit', amountText(a.securityDeposit), 'Security deposit', 'Security deposit', false, `RM ${formatRM(a.securityDeposit)}`)
  if (a.utilityDeposit != null) put(r, file, 'utilityDeposit', amountText(a.utilityDeposit), 'Utility deposit', 'Utility deposit', false, `RM ${formatRM(a.utilityDeposit)}`)
  if (a.commencing) put(r, file, 'commencing', a.commencing, 'Effective from', 'Commencing date', false, longDate(a.commencing) ?? a.commencing)
  if (a.terminating) put(r, file, 'terminating', a.terminating, 'Effective to', 'Terminating date', false, longDate(a.terminating) ?? a.terminating)
  const term = termFromDates(r.data.commencing, r.data.terminating)
  if (a.commencing && a.terminating && term) {
    put(r, file, 'term', term, 'Term (from the dates)', 'Term')
    r.data.termFrom = 'dates'
  }
  if (a.optionToRenew) put(r, file, 'optionToRenew', a.optionToRenew, `Option to renew (${a.optionMonths} months, from its dates)`, 'Option to renew')
  if (a.agreementDate) put(r, file, 'agreementDate', a.agreementDate, 'Sign tenancy agreement on/before', 'Date of Agreement', false, longDate(a.agreementDate) ?? a.agreementDate)

  // Tenant
  if (a.tenant || a.companyName) {
    const tenants = r.data.tenants
    let i = a.tenant?.idNo ? tenants.findIndex((t) => t.idNo && sameId(t.idNo, a.tenant!.idNo)) : -1
    if (i < 0) i = tenants.findIndex((t) => !t.name.trim() && !t.idNo.trim() && !t.companyName.trim())
    if (i < 0) i = 0
    if (a.companyName) {
      setPath(r.data, `tenants.${i}.kind`, 'company')
      put(r, file, `tenants.${i}.companyName`, a.companyName, 'Company (of/on behalf of)', `Tenant ${i + 1} company name`)
      if (a.tenant) {
        put(r, file, `tenants.${i}.signatory.name`, a.tenant.name, 'Tenant (person)', `Tenant ${i + 1} authorised signatory`)
        setPath(r.data, `tenants.${i}.signatory.idType`, idTypeOf(a.tenant.idNo))
        put(r, file, `tenants.${i}.signatory.idNo`, a.tenant.idNo, 'Tenant ID no.', `Tenant ${i + 1} signatory ID no.`, true)
      }
    } else if (a.tenant) {
      setPath(r.data, `tenants.${i}.kind`, 'individual')
      put(r, file, `tenants.${i}.name`, a.tenant.name, 'Tenant name', `Tenant ${i + 1} name`)
      setPath(r.data, `tenants.${i}.idType`, idTypeOf(a.tenant.idNo))
      put(r, file, `tenants.${i}.idNo`, a.tenant.idNo, `Tenant ID no. (${idTypeOf(a.tenant.idNo)})`, `Tenant ${i + 1} ID no.`, true)
    }
  }

  // Witnesses
  if (a.tenantWitness) {
    put(r, file, 'tenantWitness.name', a.tenantWitness.name, "Tenant's witness", "Tenant's witness name")
    r.data.tenantWitness.idType = idTypeOf(a.tenantWitness.idNo)
    put(r, file, 'tenantWitness.idNo', a.tenantWitness.idNo, "Tenant's witness ID", "Tenant's witness ID no.", true)
  }
  if (a.landlordWitness) {
    put(r, file, 'landlordWitness.name', a.landlordWitness.name, "Landlord's witness", "Landlord's witness name")
    r.data.landlordWitness.idType = idTypeOf(a.landlordWitness.idNo)
    put(r, file, 'landlordWitness.idNo', a.landlordWitness.idNo, "Landlord's witness ID", "Landlord's witness ID no.", true)
  }

  // Landlords
  const ll = applyLandlords(r.data, a.landlords, file, 'Agreement to Rent')
  merge(r, ll)

  if (a.landlordItems.length) {
    r.pending.push({ kind: 'clause', margin: 'Landlord to attend to', text: landlordItemsClause(a.landlordItems, longDate(a.landlordItemsDate)) })
  }
  r.warnings.push(...a.warnings)
  return r
}

function merge(into: ApplyResult, from: ApplyResult) {
  into.data = from.data
  into.findings.push(...from.findings)
  into.warnings.push(...from.warnings)
  Object.assign(into.sources, from.sources)
  into.pending.push(...from.pending)
}

// ── Passport ─────────────────────────────────────────────────────────────────

export function applyPassport(
  d: TenancyData, p: PassportResult, file: string, opts: { tenantIndex?: number; force?: boolean } = {},
): ApplyResult {
  const r = start(d)
  r.warnings.push(...p.warnings)
  const tenants = r.data.tenants
  let i: number
  if (opts.tenantIndex != null) i = opts.tenantIndex
  else {
    i = p.passportNo ? tenants.findIndex((t) => t.idNo.trim() && sameId(t.idNo, p.passportNo)) : -1
    if (i < 0) {
      if (tenants.length === 1) i = 0
      else {
        r.pending.push({ kind: 'passportTenant', passport: p, reason: 'choose' })
        r.warnings.push(`Several tenants and none has passport no. ${p.passportNo || '(unread)'}; choose which tenant this passport belongs to.`)
        return r
      }
    }
  }
  const t = tenants[i]
  if (!opts.force && t && t.idNo.trim() && p.passportNo && !sameId(t.idNo, p.passportNo)) {
    r.pending.push({ kind: 'passportTenant', passport: p, reason: 'mismatch', tenantIndex: i, existingNo: t.idNo })
    r.warnings.push(`Passport number mismatch for Tenant ${i + 1}: the form has ${t.idNo}, this passport shows ${p.passportNo}. Nothing was changed.`)
    return r
  }
  setPath(r.data, `tenants.${i}.kind`, 'individual')
  if (p.name) put(r, file, `tenants.${i}.name`, p.name, 'Surname + given name', `Tenant ${i + 1} name`)
  r.data.tenants[i].idType = 'Passport'
  if (p.passportNo) put(r, file, `tenants.${i}.idNo`, p.passportNo, `Passport No.${p.usedMrz ? ' (machine-readable line, check digits valid)' : ''}`, `Tenant ${i + 1} ID no.`, true)
  if (p.nationality) put(r, file, `tenants.${i}.nationality`, p.nationality, 'Nationality', `Tenant ${i + 1} nationality`)
  if (p.dob) put(r, file, `tenants.${i}.dob`, p.dob, 'Date of birth', `Tenant ${i + 1} date of birth`, false, plainDob(p.dob))
  if (p.gender) put(r, file, `tenants.${i}.gender`, p.gender, 'Sex', `Tenant ${i + 1} gender`)
  return r
}

const plainDob = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${d} ${M[m - 1]} ${y}`
}

// ── Bank details and address ─────────────────────────────────────────────────

export function applyBankAddress(d: TenancyData, b: BankAddressResult, file: string): ApplyResult {
  const r = start(d)
  if (b.bankName) put(r, file, 'bankName', b.bankName, 'Bank', 'Mode of payment: bank')
  if (b.accountNo) put(r, file, 'accountNo', b.accountNo, 'Account no.', 'Mode of payment: account no.', true)
  if (b.accountHolder) put(r, file, 'accountHolder', b.accountHolder, 'Account holder', 'Mode of payment: account holder')
  r.warnings.push(...b.warnings)
  if (b.address) {
    merge(r, applyAddress(r.data, b.address, 'allLandlords', file))
    r.pending.push({ kind: 'address', address: b.address, target: 'allLandlords' })
  }
  return r
}

/** Puts an address on all landlords, the premises, or one landlord; first clears it from wherever it was put before. */
export function applyAddress(d: TenancyData, address: string, target: AddressTarget, file: string): ApplyResult {
  const r = start(d)
  const same = (s: string) => s.trim() === address.trim()
  r.data.landlords.forEach((l, i) => { if (same(l.address)) { l.address = ''; delete r.sources[`landlords.${i}.address`] } })
  if (same(r.data.premises)) r.data.premises = ''
  if (target === 'premises') put(r, file, 'premises', address, 'Address', 'Premises address')
  else if (target === 'allLandlords') r.data.landlords.forEach((_, i) => put(r, file, `landlords.${i}.address`, address, 'Address', `Landlord ${i + 1} address`))
  else {
    const i = Number(target.split(':')[1])
    if (r.data.landlords[i]) put(r, file, `landlords.${i}.address`, address, 'Address', `Landlord ${i + 1} address`)
  }
  return r
}

export function addExtraClause(d: TenancyData, margin: string, text: string): TenancyData {
  return { ...d, extraClauses: [...d.extraClauses, { id: newId(), margin, text }] }
}
