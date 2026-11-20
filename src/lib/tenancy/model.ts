// Turns a template + typed draft data into a renderer-neutral document model.
// The PDF (pdf-lib) and Word (docx) renderers both draw from this, so wording and numbering live in one place.

import type { TenancyTemplate, TemplateClause, ScheduleRowDef } from './templates'
import type { TenancyData, PersonId, Tenant } from './types'
import { isForeignTenant } from './types'
import {
  parseAmount, formatRM, numberToWords, ordinal, longDate, plainLongDate, depositMonthsLabel, parseYmd,
} from './helpers'

export const BLANK = '...........'

export interface Run { text: string; bold?: boolean }
export type Line = Run[]

export interface BodyItem {
  kind: 'clause' | 'heading'
  /** 0 = main clause, 1 = sub-clause */
  level: 0 | 1
  no: string
  margin: string[]
  text: string
}

export interface PartyLine { name: string; idLine: string }

export interface SigningBlock {
  heading: string
  signer: Line[]
  witness: Line[]
}

export interface ScheduleRow { no: string; item: string; lines: Line[] }

export interface AgreementModel {
  fileStem: string
  cover: { date: string; premisesLines: string[]; landlords: PartyLine[]; tenants: PartyLine[] }
  body: BodyItem[]
  testimonium: string
  signing: SigningBlock[]
  schedule: { title: string; subtitle: string; columns: string[]; rows: ScheduleRow[] }
  scheduleII: TenancyTemplate['json']['schedule_ii'] & { landlordName: string; tenantName: string }
}

const v = (s: string | null | undefined) => (s && s.trim() ? s.trim() : BLANK)
const upper = (s: string | null | undefined) => (s && s.trim() ? s.trim().toUpperCase() : BLANK)
const lines = (s: string | null | undefined) => {
  const out = (s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return out.length ? out : [BLANK]
}

/** "NRIC NO : 800101-14-5566" / "PASSPORT NO : A1234567" */
export function idLabel(p: Pick<PersonId, 'idType' | 'idNo'>): string {
  return `${p.idType === 'Passport' ? 'PASSPORT NO' : 'NRIC NO'} : ${v(p.idNo)}`
}

function tenantName(t: Tenant): string {
  return t.kind === 'company' ? upper(t.companyName) : upper(t.name)
}

function tenantIdLine(t: Tenant): string {
  return t.kind === 'company' ? `Company No : ${v(t.companyNo)}` : idLabel(t)
}

function amountLine(raw: string): Line {
  const n = parseAmount(raw)
  if (n == null) return [{ text: `RM${BLANK} (Ringgit Malaysia ${BLANK} Only)`, bold: true }]
  return [{ text: `RM${formatRM(n)} (Ringgit Malaysia ${numberToWords(n)} Only)`, bold: true }]
}

/** Months text for a deposit row: typed override, else deposit ÷ rent. */
export function depositMonths(override: string | null, deposit: string, rent: string): string {
  if (override != null && override.trim()) return override.trim()
  return depositMonthsLabel(parseAmount(deposit), parseAmount(rent)) ?? `${BLANK} months`
}

/** Due day: typed day, else the commencing day; null when neither is known. */
export function dueDayNumber(d: TenancyData): number | null {
  const typed = parseInt(d.dueDay, 10)
  if (Number.isFinite(typed) && typed >= 1 && typed <= 31) return typed
  return parseYmd(d.commencing)?.d ?? null
}

const normNo = (no: string) => no.replace(/[\s.]/g, '').toLowerCase()

function scheduleRow(def: ScheduleRowDef, d: TenancyData): ScheduleRow | null {
  const key = normNo(def.no)
  const row = (lines: Line[], item = def.item): ScheduleRow => ({ no: def.no, item, lines })
  const plain = (text: string): Line => [{ text }]
  switch (key) {
    case '1':
      return row([plain(longDate(d.agreementDate) ?? BLANK)])
    case '2': {
      const out: Line[] = []
      d.landlords.forEach((l, i) => {
        if (i > 0) out.push(plain(''))
        out.push([{ text: upper(l.name), bold: true }, { text: ` (${idLabel(l)})` }])
        if (l.address.trim()) lines(l.address).forEach((a) => out.push(plain(a)))
      })
      return row(out)
    }
    case '3': {
      const out: Line[] = []
      d.tenants.forEach((t, i) => {
        if (i > 0) out.push(plain(''))
        out.push([{ text: tenantName(t), bold: true }, { text: ` (${tenantIdLine(t)})` }])
        if (t.kind === 'company') {
          const occ = t.occupants.filter((o) => o.name.trim() || o.idNo.trim())
            .map((o) => `${upper(o.name)}${o.idNo.trim() ? ` (${o.idNo.trim()})` : ''}`)
          out.push(plain(`Occupant(s) : ${occ.length ? occ.join(', ') : BLANK}`))
        } else if (isForeignTenant(t)) {
          out.push(plain(`Nationality : ${v(t.nationality)}`))
          out.push(plain(`Date of Birth : ${plainLongDate(t.dob) ?? BLANK}`))
          out.push(plain(`Gender : ${v(t.gender)}`))
        }
      })
      return row(out)
    }
    case '4':
      return row(lines(d.premises).map((text) => [{ text, bold: true }]))
    case '5a':
      return row([plain(v(d.term))])
    case '5b':
      return row([[{ text: longDate(d.commencing, true) ?? BLANK, bold: true }]])
    case '5c':
      return row([[{ text: longDate(d.terminating, true) ?? BLANK, bold: true }]])
    case '6a':
      return row([amountLine(d.monthlyRent)])
    case '6b': {
      const day = dueDayNumber(d)
      const text = def.particulars.replace(/\{dueDay\}(th)?/, day ? ordinal(day) : BLANK)
      return row([plain(text)])
    }
    case '6c': {
      const values: Record<string, string> = { bankName: d.bankName, accountNo: d.accountNo, accountHolder: d.accountHolder }
      return row(def.particulars.split(' / ').map((part): Line => {
        const m = /^(.*?)\{(\w+)\}(.*)$/.exec(part)
        if (!m) return plain(part)
        return [{ text: m[1] }, { text: v(values[m[2]]), bold: true }, ...(m[3] ? [{ text: m[3] }] : [])]
      }))
    }
    case '7':
      return row([amountLine(d.securityDeposit)],
        def.item.replace(/\(\{n\}\s*months?\s*rental\)/, `(${depositMonths(d.securityMonths, d.securityDeposit, d.monthlyRent)} rental)`))
    case '8':
      return row([amountLine(d.utilityDeposit)],
        def.item.replace(/\(\{n\}\s*months?\s*rental\)/, `(${depositMonths(d.utilityMonths, d.utilityDeposit, d.monthlyRent)} rental)`))
    case '9':
      return row([plain(v(d.optionToRenew))])
    case '10':
      return row([plain(v(d.useOfPremises))])
    case '11': {
      if (!d.accessCardAmount.trim() && !d.accessCardDetails.trim()) return null
      const n = parseAmount(d.accessCardAmount)
      const amount = n == null ? v(d.accessCardAmount) : formatRM(n)
      return row([plain(`RM ${amount}${d.accessCardDetails.trim() ? ` (${d.accessCardDetails.trim()})` : ''}`)])
    }
    default:
      return def.optional ? null : row([plain(def.particulars)])
  }
}

function signerLines(p: PersonId): Line[] {
  return [[{ text: upper(p.name), bold: true }], [{ text: `(${idLabel(p)})` }]]
}

export function buildAgreementModel(template: TenancyTemplate, d: TenancyData): AgreementModel {
  const t = template.json

  // ── Body ──
  const body: BodyItem[] = []
  body.push({ kind: 'clause', level: 0, no: '', margin: t.preamble.margin, text: t.preamble.text })
  body.push({ kind: 'heading', level: 0, no: '', margin: [], text: 'WHEREAS :-' })
  for (const w of t.whereas) body.push({ kind: 'clause', level: 0, no: w.no, margin: w.margin, text: w.text })
  body.push({ kind: 'heading', level: 0, no: '', margin: [], text: t.agreed_intro })

  const extras = d.extraClauses.filter((c) => c.text.trim() || c.margin.trim())
  const pushClause = (c: TemplateClause) => {
    body.push({ kind: 'clause', level: 0, no: c.no, margin: c.margin, text: c.text })
    const subs = c.sub ?? []
    for (const s of subs) body.push({ kind: 'clause', level: 1, no: s.no, margin: s.margin, text: s.text })
    if (c.no === template.render.extraClausesAfter) {
      let next = subs.length + 1
      for (const x of extras) {
        body.push({
          kind: 'clause', level: 1, no: `${c.no}.${next++}`,
          margin: x.margin.trim() ? [x.margin.trim()] : [], text: x.text.trim() || BLANK,
        })
      }
    }
  }
  t.agreed.forEach(pushClause)

  // ── Signing ──
  const signing: SigningBlock[] = []
  const witness = (w: PersonId): Line[] => [[{ text: 'In the presence of :' }], ...signerLines(w)]
  for (const l of d.landlords) {
    signing.push({ heading: 'SIGNED BY THE SAID LANDLORD', signer: signerLines(l), witness: witness(d.landlordWitness) })
  }
  for (const tn of d.tenants) {
    const signer: Line[] = tn.kind === 'company'
      ? [
          [{ text: upper(tn.companyName), bold: true }],
          [{ text: `(Company No : ${v(tn.companyNo)})` }],
          ...(tn.signatory.name.trim()
            ? [[{ text: 'Authorised signatory : ' }, { text: upper(tn.signatory.name), bold: true }], [{ text: `(${idLabel(tn.signatory)})` }]]
            : []),
        ]
      : signerLines(tn)
    signing.push({ heading: 'SIGNED BY THE SAID TENANT', signer, witness: witness(d.tenantWitness) })
  }

  // ── Schedule ──
  const rows = t.schedule.rows.map((r) => scheduleRow(r, d)).filter((r): r is ScheduleRow => r !== null)

  const premisesLines = lines(d.premises)
  const stemPlace = premisesLines[0] === BLANK ? 'Draft' : premisesLines[0].replace(/,\s*$/, '')

  return {
    fileStem: `Tenancy Agreement ${stemPlace}`.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120),
    cover: {
      date: longDate(d.agreementDate) ?? BLANK,
      premisesLines,
      landlords: d.landlords.map((l) => ({ name: upper(l.name), idLine: `(${idLabel(l)})` })),
      tenants: d.tenants.map((tn) => ({ name: tenantName(tn), idLine: `(${tenantIdLine(tn)})` })),
    },
    body,
    testimonium: t.testimonium,
    signing,
    schedule: { title: t.schedule.title, subtitle: t.schedule.subtitle, columns: t.schedule.columns, rows },
    scheduleII: {
      ...t.schedule_ii,
      landlordName: upper(d.schedIILandlordName ?? d.landlordWitness.name),
      tenantName: upper(d.schedIITenantName ?? d.tenantWitness.name),
    },
  }
}
