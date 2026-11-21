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
  /** Plain wording (bold markers removed). */
  text: string
  /** The same wording as styled runs: **…** in the template JSON marks bold. */
  runs: Run[]
}

/** "a **Section 1 of the Schedule** b" → runs [a ][Section 1 of the Schedule (bold)][ b]. */
export function parseBold(text: string): Run[] {
  const runs: Run[] = []
  const re = /\*\*([\s\S]+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) })
    runs.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.length ? runs : [{ text }]
}

const plainText = (text: string) => text.replace(/\*\*/g, '')

export interface PartyLine { name: string; idLine: string }

/** One side of the signing page: the heading once, every signer, then one witness block. */
export interface SigningSide {
  heading: string
  signers: Line[][]
  witness: Line[]
}

export interface ScheduleRow { no: string; item: string; lines: Line[] }

export interface AgreementModel {
  fileStem: string
  cover: { date: string; premisesLines: string[]; landlords: PartyLine[]; tenants: PartyLine[] }
  body: BodyItem[]
  testimonium: string
  signing: SigningSide[]
  schedule: { title: string; subtitle: string; columns: string[]; rows: ScheduleRow[] }
  scheduleII: TenancyTemplate['json']['schedule_ii'] & { landlordNames: string[]; tenantNames: string[]; landlordSignTitle: string; tenantSignTitle: string }
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

/** Stored line breaks become spaces so an address flows as normal paragraph text. */
export function flowAddress(s: string | null | undefined): string {
  return (s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ')
}

/** The common address when every landlord has the same one (trimmed, spaces collapsed, case ignored); else null. */
export function sharedAddress(addresses: string[]): string | null {
  if (!addresses.length || addresses.some((a) => !a)) return null
  const key = (a: string) => a.replace(/\s+/g, ' ').trim().toLowerCase()
  return addresses.every((a) => key(a) === key(addresses[0])) ? addresses[0] : null
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
      // Name and ID on one line. The address is printed once after the last landlord when every landlord has
      // the same address; otherwise each landlord's own address goes under that landlord.
      const out: Line[] = []
      const addresses = d.landlords.map((l) => flowAddress(l.address))
      const shared = sharedAddress(addresses)
      d.landlords.forEach((l, i) => {
        if (i > 0 && !shared && addresses[i - 1]) out.push(plain(''))
        out.push([{ text: upper(l.name), bold: true }, { text: ` (${idLabel(l)})` }])
        if (!shared && addresses[i]) out.push(plain(addresses[i]))
      })
      if (shared) out.push(plain(shared))
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
      return row([[{ text: flowAddress(d.premises) || BLANK, bold: true }]])
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
  const clause = (level: 0 | 1, no: string, margin: string[], text: string): BodyItem =>
    ({ kind: 'clause', level, no, margin, text: plainText(text), runs: parseBold(text) })
  const heading = (text: string): BodyItem => ({ kind: 'heading', level: 0, no: '', margin: [], text, runs: [{ text, bold: true }] })
  body.push(clause(0, '', t.preamble.margin, t.preamble.text))
  body.push(heading('WHEREAS :-'))
  for (const w of t.whereas) body.push(clause(0, w.no, w.margin, w.text))
  body.push(heading(t.agreed_intro))

  const extras = d.extraClauses.filter((c) => c.text.trim() || c.margin.trim())
  const pushClause = (c: TemplateClause) => {
    body.push(clause(0, c.no, c.margin, c.text))
    const subs = c.sub ?? []
    for (const s of subs) body.push(clause(1, s.no, s.margin, s.text))
    if (c.no === template.render.extraClausesAfter) {
      let next = subs.length + 1
      for (const x of extras) {
        // Typed clauses are printed as typed (no bold markers).
        const text = x.text.trim() || BLANK
        body.push({ kind: 'clause', level: 1, no: `${c.no}.${next++}`, margin: x.margin.trim() ? [x.margin.trim()] : [], text, runs: [{ text }] })
      }
    }
  }
  t.agreed.forEach(pushClause)

  // ── Signing: one heading and one witness block per side ──
  const witness = (w: PersonId): Line[] => [[{ text: 'In the presence of :' }], ...signerLines(w)]
  const tenantSigner = (tn: Tenant): Line[] => (tn.kind === 'company'
    ? [
        [{ text: upper(tn.companyName), bold: true }],
        [{ text: `(Company No : ${v(tn.companyNo)})` }],
        ...(tn.signatory.name.trim()
          ? [[{ text: 'Authorised signatory : ' }, { text: upper(tn.signatory.name), bold: true }], [{ text: `(${idLabel(tn.signatory)})` }]]
          : []),
      ]
    : signerLines(tn))
  const signing: SigningSide[] = [
    { heading: 'SIGNED BY THE SAID LANDLORD', signers: d.landlords.map(signerLines), witness: witness(d.landlordWitness) },
    { heading: 'SIGNED BY THE SAID TENANT', signers: d.tenants.map(tenantSigner), witness: witness(d.tenantWitness) },
  ]

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
      landlordNames: d.landlords.map((l) => upper(l.name)),
      tenantNames: d.tenants.map(tenantName),
      landlordSignTitle: 'Signed by the Landlord / in the presence of:',
      tenantSignTitle: 'Confirmed & Signed by the Tenant',
    },
  }
}
