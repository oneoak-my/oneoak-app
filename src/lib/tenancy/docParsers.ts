// Free, tolerant parsers for documents dropped on a tenancy agreement draft (no AI, pure functions).
// Input is plain text from pdf.js or tesseract OCR (or pasted text); PDF text can come out in a scrambled
// order and OCR can misread characters, so every rule searches loosely and reports what it could not read.

import { integerToWords, parseAmount, termBetween } from './helpers'

export type DocKind = 'atr' | 'landlords' | 'passport' | 'bankAddress' | 'unknown'

export interface Party { name: string; idNo: string }

// ── Small helpers ────────────────────────────────────────────────────────────

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** "950621146424" / "950621-14-6424" → "950621-14-6424"; anything else upper-cased without spaces. */
export function normaliseId(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, '')
  const digits = s.replace(/-/g, '')
  if (/^\d{12}$/.test(digits)) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
  return s
}

/** NRIC is 6-2-4 digits; anything else is treated as a passport number. */
export function idTypeOf(id: string): 'NRIC' | 'Passport' {
  return /^\d{6}-\d{2}-\d{4}$/.test(normaliseId(id)) ? 'NRIC' : 'Passport'
}

/** OCR fixes for a mostly-digit ID (O→0, I/l/|→1, S→5, B→8, Z→2). Leaves passport-like IDs alone. */
export function fixOcrDigits(raw: string): string {
  const s = raw.replace(/\s+/g, '')
  const digitish = s.replace(/[^0-9OoIlSBZ|]/g, '').length
  if (digitish < 10 || /^[A-Z]{1,2}\d/.test(s)) return s
  return s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2')
}

export const sameName = (a: string, b: string) => squash(a).toUpperCase() === squash(b).toUpperCase()
export const sameId = (a: string, b: string) => normaliseId(a).replace(/-/g, '') === normaliseId(b).replace(/-/g, '')

/** "15/12/2026" → "2026-12-15" */
export function dmyToYmd(s: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s.trim())
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "15 day of 12 20 26" / "15th day of 12 2026" → "2026-12-15" (year may be split into "20" + "26"). */
export function parseDayOf(s: string): string | null {
  const m = /(\d{1,2})\s*(?:st|nd|rd|th)?\s*day\s+of\s+(\d{1,2})\s*[,/-]?\s+(\d{2})\s*(\d{2})(?!\d)/i.exec(s)
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${m[3]}${m[4]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ── Classification ───────────────────────────────────────────────────────────

export function classifyTenancyText(text: string): DocKind {
  const t = text.toUpperCase()
  if (/AGREEMENT\s+TO\s+RENT/.test(t) || /\bATR\s*\d{3,}/.test(t)) return 'atr'
  if (/P<[A-Z<]{3}/.test(t.replace(/\s+/g, '')) || /PASSPORT\s*NO/.test(t) && /(SURNAME|GIVEN\s*NAME|DATE\s+OF\s+BIRTH)/.test(t) || /\bSU(?:RN|M)A(?:RN|M)E\b/.test(t) && /\bNATIONALITY\b/.test(t)) return 'passport'
  if ((t.match(/\bNAME\s*[:;.]/g) ?? []).length >= 1 && /\b(NRIC|PASSPORT|I\/C)\b/.test(t)) return 'landlords'
  const b = parseBankAddress(text)
  if (b.bankName || b.accountNo || b.address) return 'bankAddress'
  return 'unknown'
}

// ── Agreement to Rent ────────────────────────────────────────────────────────

export interface AtrResult {
  reference: string | null
  premises: string | null
  tenant: Party | null
  companyName: string | null
  monthlyRent: number | null
  securityDeposit: number | null
  utilityDeposit: number | null
  commencing: string | null
  terminating: string | null
  optionToRenew: string | null
  optionMonths: number | null
  agreementDate: string | null
  tenantWitness: Party | null
  landlordWitness: Party | null
  landlords: Party[]
  landlordItems: string[]
  landlordItemsDate: string | null
  warnings: string[]
}

const DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{4})'
const ID_LABEL = /NRIC\s*No\.?\s*\/\s*Passport\s*No\.?\s*:?\s*/gi

/** Text of the form "Three ( 3 ) months at a rental to be mutually agreed upon." */
export function optionToRenewText(months: number): string {
  const unit = (n: number, w: string) => `${integerToWords(n)} ( ${n} ) ${w}${n === 1 ? '' : 's'}`
  const len = months % 12 === 0 ? unit(months / 12, 'year') : unit(months, 'month')
  return `${len} at a rental to be mutually agreed upon.`
}

/** "950621-14-6424 & 570530-10-6289 | 620402-\n04-5330" → three IDs (wrapped IDs are re-joined). */
function idListAfter(text: string, at: number): string[] {
  const chunk = text.slice(at, at + 160).replace(/-\s+(?=\d)/g, '-')
  const m = /^\s*([A-Z0-9][A-Z0-9-]*(?:\s*[&|]\s*[A-Z0-9][A-Z0-9-]*)*)/i.exec(chunk)
  return m ? m[1].split(/\s*[&|]\s*/).map((s) => normaliseId(s)).filter(Boolean) : []
}

export function parseAgreementToRent(text: string): AtrResult {
  const T = text.replace(/\r/g, '')
  const F = squash(T)
  const warnings: string[] = []
  const r: AtrResult = {
    reference: /\bATR\s*\d{3,}/i.exec(F)?.[0].replace(/\s+/g, '').toUpperCase() ?? null,
    premises: null, tenant: null, companyName: null, monthlyRent: null, securityDeposit: null, utilityDeposit: null,
    commencing: null, terminating: null, optionToRenew: null, optionMonths: null, agreementDate: null,
    tenantWitness: null, landlordWitness: null, landlords: [], landlordItems: [], landlordItemsDate: null, warnings,
  }

  // Premises: after "Property Address :" up to "Malaysia." or the next known label.
  const pa = /Property\s+Address\s*:?\s*([\s\S]{3,300})/i.exec(F)
  if (pa) {
    let s = pa[1]
    const stop = /\s(?:Type\s+of\s+Property|The\s+Tenant|Security\s+Deposit|Utility\s+Deposit|Period\s+of\s+Tenancy|Option\s+to\s+Renew|Monthly\s+Rental)\b/i.exec(s)
    if (stop) s = s.slice(0, stop.index)
    const my = /Malaysia\.?/i.exec(s)
    if (my) s = s.slice(0, my.index + my[0].length)
    r.premises = squash(s.replace(/\s+,/g, ',').replace(/,(?=\S)/g, ', ')) || null
  }
  if (!r.premises) warnings.push('Property address not found.')

  // Tenant in the opening sentence.
  const tn = /The\s+Tenant\s+([A-Za-z][A-Za-z .'@-]*?)\s+NRIC\s*No\.?\s*\/\s*Passport\s*No\.?\s*:?\s*([A-Z0-9-]+)/i.exec(F)
  if (tn) r.tenant = { name: squash(tn[1]), idNo: normaliseId(tn[2]) }
  const co = /of\s*\/\s*on\s+behalf\s+of\s*\(?([^)]*?)\)?\s+hereby/i.exec(F)
  if (co) {
    const name = squash(co[1])
    if (name && !/^\(?\s*company\s*\)?$/i.test(name) && !/^[._\s-]*$/.test(name)) r.companyName = name
  }

  r.monthlyRent = parseAmount(/monthly\s+rental\s+of\s+RM\s*([\d,]+(?:\.\d+)?)/i.exec(F)?.[1])
  r.securityDeposit = parseAmount(/Security\s+Deposit\s*:?\s*RM\s*([\d,]+(?:\.\d+)?)/i.exec(F)?.[1])
  r.utilityDeposit = parseAmount(/Utility\s+Deposit\s*:?\s*RM\s*([\d,]+(?:\.\d+)?)/i.exec(F)?.[1])
  if (r.monthlyRent == null) warnings.push('Monthly rental not found.')

  const period = new RegExp(`Period\\s+of\\s+Tenancy[\\s\\S]{0,160}?effective\\s+from\\s+${DATE}\\s+to\\s+${DATE}`, 'i').exec(F)
  if (period) {
    r.commencing = dmyToYmd(period[1])
    r.terminating = dmyToYmd(period[2])
  } else warnings.push('Period of tenancy dates not found.')

  const opt = new RegExp(`Option\\s+to\\s+Renew[\\s\\S]{0,160}?effective\\s+from\\s+${DATE}\\s+to\\s+${DATE}`, 'i').exec(F)
  if (opt) {
    const from = dmyToYmd(opt[1]), to = dmyToYmd(opt[2])
    const t = from && to ? termBetween(from, to) : null
    if (t) {
      r.optionMonths = t.years * 12 + t.months
      if (r.optionMonths > 0) r.optionToRenew = optionToRenewText(r.optionMonths)
      if (t.days) warnings.push(`Option to renew is ${r.optionMonths} months and ${t.days} days; check the wording.`)
    }
  }

  const sign = /sign\s+the\s+Tenancy\s+Agreement\s+on\s*\/?\s*(?:before\s+)?(?:the\s+)?([\s\S]{0,40})/i.exec(F)
  if (sign) r.agreementDate = parseDayOf(sign[1])
  if (!r.agreementDate) warnings.push('Date for signing the tenancy agreement not found.')

  // Landlord to attend to: lettered items A. B. C. …
  const att = /attended\s+to\s+by\s+the\s+Landlord([\s\S]{0,1500})/i.exec(T)
  if (att) {
    let region = att[1]
    r.landlordItemsDate = parseDayOf(region.slice(0, 80))
    const end = /(?:^|\n|\s)3\.\s|Vacant\s+possession/i.exec(region)
    if (end) region = region.slice(0, end.index)
    const markers: { letter: string; start: number; textStart: number }[] = []
    const re = /(^|\s)([A-H])[.)]\s+/g
    let m: RegExpExecArray | null
    let expect = 'A'
    while ((m = re.exec(region))) {
      if (m[2] !== expect) continue
      markers.push({ letter: m[2], start: m.index, textStart: m.index + m[0].length })
      expect = String.fromCharCode(expect.charCodeAt(0) + 1)
    }
    r.landlordItems = markers
      .map((mk, i) => squash(region.slice(mk.textStart, i + 1 < markers.length ? markers[i + 1].start : undefined)).replace(/[;,.]\s*$/, ''))
      .filter(Boolean)
  }

  // Tenant's witness: "Signed in the presence of NAME : … NRIC NO. : …"
  const tw = /presence\s+of\s*:?\s*NAME\s*:\s*([A-Za-z][A-Za-z .'@-]*?)\s+NRIC\s*NO\.?\s*(?:\/\s*PASSPORT\s*NO\.?\s*)?:\s*([A-Z0-9-]+)/i.exec(F)
  if (tw) r.tenantWitness = { name: squash(tw[1]), idNo: normaliseId(tw[2]) }

  // Landlords: the "NAME :" line with several names, and the matching "NRIC NO./PASSPORT NO. :" list.
  const nameLines: string[] = []
  const nameRe = /\bNAME\s*:\s*([^\n]+?)(?=\s+NRIC|\s*\n|$)/gi
  let nm: RegExpExecArray | null
  while ((nm = nameRe.exec(T))) nameLines.push(squash(nm[1]))
  const others = [r.tenant?.name, r.tenantWitness?.name].filter(Boolean) as string[]
  const llLine = nameLines.find((n) => /[&|]/.test(n)) ?? nameLines.find((n) => !others.some((o) => sameName(o, n)))
  const idLists: string[][] = []
  const flatIds = T.replace(/\r/g, '')
  ID_LABEL.lastIndex = 0
  let im: RegExpExecArray | null
  while ((im = ID_LABEL.exec(flatIds))) idLists.push(idListAfter(flatIds, im.index + im[0].length))
  const knownIds = [r.tenant?.idNo, r.tenantWitness?.idNo].filter(Boolean) as string[]
  const llIds = idLists.find((l) => l.length > 1) ?? idLists.find((l) => l.length && !knownIds.some((k) => sameId(k, l[0]))) ?? []
  if (llLine) {
    const names = llLine.split(/\s*[&|]\s*/).map(squash).filter(Boolean)
    if (llIds.length && names.length !== llIds.length) {
      warnings.push(`Landlords: ${names.length} name(s) but ${llIds.length} ID number(s); they were paired in order, please check.`)
    }
    r.landlords = names.map((name, i) => ({ name, idNo: llIds[i] ?? '' }))
  } else warnings.push('Landlord names not found.')

  // Landlord's witness: a "Name 000000-00-0000" pair not used anywhere else.
  const used = [...knownIds, ...r.landlords.map((l) => l.idNo)].filter(Boolean)
  const wRe = /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})\s*:?\s*(\d{6}-\d{2}-\d{4}|[A-Z]{1,2}\d{6,8})(?![\w-])/g
  let wm: RegExpExecArray | null
  while ((wm = wRe.exec(F))) {
    const name = squash(wm[1])
    if (/\b(NRIC|PASSPORT|NAME|NO)\b/i.test(name)) continue
    if (used.some((u) => sameId(u, wm![2]))) continue
    r.landlordWitness = { name, idNo: normaliseId(wm[2]) }
    break
  }
  if (!r.tenantWitness || !r.landlordWitness) warnings.push('One or both witnesses not found.')
  else warnings.push("Witness sides are worked out from the layout (labelled one = tenant's witness); please check.")
  return r
}

/** "The Landlord shall attend to the following on or before 15th December 2026: (a) … (b) …" */
export function landlordItemsClause(items: string[], dateText: string | null): string {
  const list = items.map((it, i) => `(${String.fromCharCode(97 + i)}) ${it}`).join(' ')
  return `The Landlord shall attend to the following on or before ${dateText ?? '...........'}: ${list}`
}

// ── Landlord names picture ───────────────────────────────────────────────────

export function parseLandlordNames(text: string): { landlords: Party[]; warnings: string[] } {
  const warnings: string[] = []
  const lines = text.replace(/\r/g, '').split(/\n|\s\/\s/).map(squash).filter(Boolean)
  const out: Party[] = []
  let pendingName: string | null = null
  let wantName = false
  const idRe = /\b(?:NRIC|PASSPORT|I\/C|IC)\b\s*(?:NO\.?)?\s*[:;.]?\s*([A-Za-z0-9][A-Za-z0-9 -]{4,24})/i
  for (const line of lines) {
    const nameM = /\bNAME\s*[:;.]?\s*(.*)$/i.exec(line)
    const idM = idRe.exec(line)
    if (nameM && !(idM && idM.index < nameM.index)) {
      let name = nameM[1]
      if (idM && idM.index > nameM.index) name = line.slice(nameM.index, idM.index).replace(/^NAME\s*[:;.]?\s*/i, '')
      name = squash(name.replace(/[^A-Za-z .'@-]/g, ' '))
      pendingName = name || null
      wantName = !name
      if (!idM) continue
    } else if (wantName && !idM) {
      pendingName = squash(line.replace(/[^A-Za-z .'@-]/g, ' ')) || null
      wantName = false
      continue
    }
    if (idM && pendingName) {
      const id = normaliseId(fixOcrDigits(idM[1].trim().split(/\s{2,}/)[0]))
      out.push({ name: pendingName.toUpperCase(), idNo: id })
      pendingName = null
    }
  }
  if (pendingName) { out.push({ name: pendingName.toUpperCase(), idNo: '' }); warnings.push(`No ID number found for ${pendingName}.`) }
  if (!out.length) warnings.push('No "Name" + "NRIC/Passport" pairs could be read.')
  for (const p of out) {
    if (p.idNo && idTypeOf(p.idNo) === 'Passport' && /^\d/.test(p.idNo)) warnings.push(`ID "${p.idNo}" for ${p.name} does not look like an NRIC (6-2-4 digits); check the digits.`)
  }
  return { landlords: out, warnings }
}

// ── Passport ─────────────────────────────────────────────────────────────────

const DEMONYMS: Record<string, string> = {
  JAPAN: 'Japanese', JPN: 'Japanese', CHINA: 'Chinese', CHN: 'Chinese', "PEOPLE'S REPUBLIC OF CHINA": 'Chinese',
  KOREA: 'Korean', KOR: 'Korean', 'REPUBLIC OF KOREA': 'Korean', 'SOUTH KOREA': 'Korean',
  INDONESIA: 'Indonesian', IDN: 'Indonesian', SINGAPORE: 'Singaporean', SGP: 'Singaporean',
  THAILAND: 'Thai', THA: 'Thai', VIETNAM: 'Vietnamese', 'VIET NAM': 'Vietnamese', VNM: 'Vietnamese',
  PHILIPPINES: 'Filipino', PHL: 'Filipino', INDIA: 'Indian', IND: 'Indian', PAKISTAN: 'Pakistani', PAK: 'Pakistani',
  BANGLADESH: 'Bangladeshi', BGD: 'Bangladeshi', MYANMAR: 'Myanmar', MMR: 'Myanmar', NEPAL: 'Nepalese', NPL: 'Nepalese',
  'SRI LANKA': 'Sri Lankan', LKA: 'Sri Lankan', TAIWAN: 'Taiwanese', TWN: 'Taiwanese', 'HONG KONG': 'Hong Konger', HKG: 'Hong Konger',
  CAMBODIA: 'Cambodian', KHM: 'Cambodian', LAOS: 'Lao', LAO: 'Lao', BRUNEI: 'Bruneian', BRN: 'Bruneian',
  MALAYSIA: 'Malaysian', MYS: 'Malaysian', AUSTRALIA: 'Australian', AUS: 'Australian', 'NEW ZEALAND': 'New Zealander', NZL: 'New Zealander',
  'UNITED KINGDOM': 'British', GBR: 'British', 'UNITED STATES': 'American', 'UNITED STATES OF AMERICA': 'American', USA: 'American',
  CANADA: 'Canadian', CAN: 'Canadian', FRANCE: 'French', FRA: 'French', GERMANY: 'German', DEU: 'German', D: 'German',
  ITALY: 'Italian', ITA: 'Italian', SPAIN: 'Spanish', ESP: 'Spanish', NETHERLANDS: 'Dutch', NLD: 'Dutch',
  SWITZERLAND: 'Swiss', CHE: 'Swiss', SWEDEN: 'Swedish', SWE: 'Swedish', NORWAY: 'Norwegian', NOR: 'Norwegian',
  DENMARK: 'Danish', DNK: 'Danish', IRELAND: 'Irish', IRL: 'Irish', RUSSIA: 'Russian', 'RUSSIAN FEDERATION': 'Russian', RUS: 'Russian',
  IRAN: 'Iranian', IRN: 'Iranian', 'SAUDI ARABIA': 'Saudi', SAU: 'Saudi', 'UNITED ARAB EMIRATES': 'Emirati', ARE: 'Emirati',
  EGYPT: 'Egyptian', EGY: 'Egyptian', TURKEY: 'Turkish', TURKIYE: 'Turkish', TUR: 'Turkish', NIGERIA: 'Nigerian', NGA: 'Nigerian',
  'SOUTH AFRICA': 'South African', ZAF: 'South African', BRAZIL: 'Brazilian', BRA: 'Brazilian', MEXICO: 'Mexican', MEX: 'Mexican',
}

/** "JAPAN" → "Japanese"; unknown text is kept as typed (title case). */
export function demonym(country: string): string {
  const key = squash(country).toUpperCase()
  if (DEMONYMS[key]) return DEMONYMS[key]
  return key.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

const MONTHS3: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 }

/** "11 SEP 1996" / "11 SEP /SEPT 1996" → "1996-09-11" */
export function parsePrintedDate(s: string): string | null {
  const m = /(\d{1,2})\s*([A-Z]{3})[A-Z]*(?:\s*\/\s*[A-Z]+)?\s*(\d{4})/i.exec(s)
  if (!m) return null
  const mo = MONTHS3[m[2].toUpperCase()]
  const d = Number(m[1])
  if (!mo || d < 1 || d > 31) return null
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// MRZ (ICAO 9303, TD3 passports)
const mrzValue = (c: string) => (c === '<' ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55)
export function mrzCheckDigit(s: string): number {
  const w = [7, 3, 1]
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += mrzValue(s[i]) * w[i % 3]
  return sum % 10
}

export interface MrzResult {
  surname: string; givenNames: string; passportNo: string; nationalityCode: string; dob: string | null
  sex: 'Male' | 'Female' | ''; valid: boolean; checks: { passportNo: boolean; dob: boolean; expiry: boolean; composite: boolean }
}

export function parseMrz(text: string, now = new Date()): MrzResult | null {
  const lines = text.toUpperCase().replace(/«/g, '<<').split('\n').map((l) => l.replace(/\s+/g, ''))
  const i1 = lines.findIndex((l) => /^P[A-Z<][A-Z<]{3}/.test(l) && l.includes('<<') && l.length >= 30)
  if (i1 < 0) return null
  const l2raw = lines.slice(i1 + 1).find((l) => /^[A-Z0-9<]{28,}$/.test(l))
  if (!l2raw) return null
  const l1 = lines[i1].padEnd(44, '<').slice(0, 44)
  const l2 = l2raw.padEnd(44, '<').slice(0, 44)
  const [surnameRaw, givenRaw = ''] = l1.slice(5).split('<<')
  const no = l2.slice(0, 9), dobRaw = l2.slice(13, 19), exp = l2.slice(21, 27)
  const digit = (c: string) => (/\d/.test(c) ? Number(c) : -1)
  const checks = {
    passportNo: mrzCheckDigit(no) === digit(l2[9]),
    dob: mrzCheckDigit(dobRaw) === digit(l2[19]),
    expiry: mrzCheckDigit(exp) === digit(l2[27]),
    composite: mrzCheckDigit(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)) === digit(l2[43]),
  }
  let dob: string | null = null
  if (/^\d{6}$/.test(dobRaw)) {
    const yy = Number(dobRaw.slice(0, 2))
    const century = yy > now.getFullYear() % 100 ? 1900 : 2000
    dob = `${century + yy}-${dobRaw.slice(2, 4)}-${dobRaw.slice(4, 6)}`
  }
  const sexC = l2[20]
  return {
    surname: surnameRaw.replace(/</g, ' ').trim(),
    givenNames: givenRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim(),
    passportNo: no.replace(/</g, ''),
    nationalityCode: l2.slice(10, 13).replace(/</g, ''),
    dob,
    sex: sexC === 'M' ? 'Male' : sexC === 'F' ? 'Female' : '',
    valid: checks.passportNo && checks.dob,
    checks,
  }
}

export interface PassportResult {
  name: string
  surname: string
  givenNames: string
  nationality: string
  dob: string | null
  gender: 'Male' | 'Female' | ''
  passportNo: string
  usedMrz: boolean
  warnings: string[]
}

/** Value for a printed label: same line after the label, else the next two lines, using the validator. */
function labelValue(lines: string[], label: RegExp, valid: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i])
    if (!m) continue
    const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s/:.]+/, '')
    for (const cand of [rest, lines[i + 1] ?? '', lines[i + 2] ?? '']) {
      const v = valid.exec(cand)
      if (v) return v[1] ?? v[0]
    }
  }
  return null
}

export function parsePassport(text: string, now = new Date()): PassportResult {
  const warnings: string[] = []
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  const upperWord = /^([A-Z][A-Z' -]*[A-Z])\b/
  // OCR often reads "rn" as "m" ("Sumame") and "i" as "l"/"1" ("Glven").
  const surname = labelValue(lines, /\bSu(?:rn|m)a(?:rn|m)e\b/i, upperWord)
  const given = labelValue(lines, /\bG[il1]ven\s*na(?:rn|m)es?\b/i, upperWord)
  const country = labelValue(lines, /\bNationality\b/i, /^([A-Z][A-Z' ]*[A-Z])\b/)
  const dobText = labelValue(lines, /\bDate\s+of\s+birth\b/i, /(\d{1,2}\s*[A-Z]{3}[A-Z]*(?:\s*\/\s*[A-Z]+)?\s*\d{4})/i)
  const sexText = labelValue(lines, /\bSex\b/i, /(?:^|\s)([MF])(?=\s|\/|$)/)
  let passportNo = labelValue(lines, /\bPassport\s*No\.?/i, /\b([A-Z]{1,2}\d{6,8})\b/)
  if (!passportNo) passportNo = /\b([A-Z]{1,2}\d{7})\b/.exec(text)?.[1] ?? null

  const r: PassportResult = {
    surname: surname ?? '',
    givenNames: given ?? '',
    name: squash(`${surname ?? ''} ${given ?? ''}`).toUpperCase(),
    nationality: country ? demonym(country) : '',
    dob: dobText ? parsePrintedDate(dobText) : null,
    gender: sexText === 'M' ? 'Male' : sexText === 'F' ? 'Female' : '',
    passportNo: passportNo ?? '',
    usedMrz: false,
    warnings,
  }

  const mrz = parseMrz(text, now)
  if (mrz) {
    if (mrz.valid) {
      r.usedMrz = true
      if (mrz.surname) r.surname = mrz.surname
      if (mrz.givenNames) r.givenNames = mrz.givenNames
      r.name = squash(`${r.surname} ${r.givenNames}`).toUpperCase()
      r.passportNo = mrz.passportNo
      if (mrz.dob) r.dob = mrz.dob
      if (mrz.sex) r.gender = mrz.sex
      if (mrz.nationalityCode) r.nationality = demonym(mrz.nationalityCode)
      if (passportNo && !sameId(passportNo, mrz.passportNo)) warnings.push(`Printed passport no. ${passportNo} differs from the machine-readable line ${mrz.passportNo}; used the machine-readable one (check digits valid).`)
    } else {
      warnings.push('Machine-readable lines found but their check digits do not match (OCR misread?); used the printed fields instead.')
    }
  }
  if (!r.name) warnings.push('Surname / given name not read.')
  if (!r.passportNo) warnings.push('Passport number not read.')
  if (!r.dob) warnings.push('Date of birth not read.')
  if (!r.gender) warnings.push('Sex not read.')
  if (!r.nationality) warnings.push('Nationality not read.')
  return r
}

// ── Bank details and address ─────────────────────────────────────────────────

const BANKS: [RegExp, string][] = [
  [/\bMAYBANK\b|MALAYAN\s+BANKING/i, 'Maybank'],
  [/\bCIMB\b/i, 'CIMB Bank'],
  [/\bPUBLIC\s*BANK\b|\bPBB\b/i, 'Public Bank'],
  [/\bRHB\b/i, 'RHB Bank'],
  [/\bHONG\s*LEONG\b|\bHLB\b/i, 'Hong Leong Bank'],
  [/\bAM\s?BANK\b/i, 'AmBank'],
  [/\bHSBC\b/i, 'HSBC Bank'],
  [/\bUOB\b|UNITED\s+OVERSEAS\s+BANK/i, 'UOB'],
  [/\bOCBC\b/i, 'OCBC Bank'],
  [/\bBANK\s+ISLAM\b/i, 'Bank Islam'],
  [/\bAFFIN\b/i, 'Affin Bank'],
  [/\bALLIANCE\s+BANK\b/i, 'Alliance Bank'],
  [/\bBSN\b|BANK\s+SIMPANAN\s+NASIONAL/i, 'BSN'],
  [/\bSTANDARD\s+CHARTERED\b|\bSCB\b/i, 'Standard Chartered'],
  [/\bAGRO\s*BANK\b/i, 'Agrobank'],
  [/\bBANK\s+RAKYAT\b/i, 'Bank Rakyat'],
  [/\bBANK\s+MUAMALAT\b/i, 'Bank Muamalat'],
  [/\bMBSB\b/i, 'MBSB Bank'],
  [/\bCITI\s*BANK\b/i, 'Citibank'],
  [/\bAL\s*RAJHI\b/i, 'Al Rajhi Bank'],
  [/\bKUWAIT\s+FINANCE\s+HOUSE\b|\bKFH\b/i, 'Kuwait Finance House'],
  [/\bGX\s*BANK\b/i, 'GXBank'],
  [/\bBANK\s+OF\s+CHINA\b/i, 'Bank of China'],
]

export interface BankAddressResult {
  bankName: string | null
  accountNo: string | null
  accountHolder: string | null
  address: string | null
  warnings: string[]
}

const ADDRESS_WORD = /\b(JALAN|JLN|LORONG|PERSIARAN|TAMAN|RESIDENSI|RESIDENCE|KONDOMINIUM|CONDO|APARTMENT|PANGSAPURI|DESA|BANDAR|BUKIT|KAMPUNG|SEKSYEN|KUALA\s+LUMPUR|SELANGOR|PETALING|JOHOR|PENANG|PULAU\s+PINANG|PERAK|MELAKA|SABAH|SARAWAK|PUTRAJAYA|CYBERJAYA|NO\.)/i

export function parseBankAddress(text: string): BankAddressResult {
  const warnings: string[] = []
  const lines = text.replace(/\r/g, '').split(/\n|\s\/\s/).map(squash).filter(Boolean)
  let bankName: string | null = null
  let bankIdx = -1
  lines.forEach((l, i) => {
    if (bankName) return
    for (const [re, name] of BANKS) if (re.test(l)) { bankName = name; bankIdx = i; return }
  })

  const isAddress = (l: string) => /\b\d{5}\b/.test(l) && ADDRESS_WORD.test(l) || (ADDRESS_WORD.test(l) && /,/.test(l) && /\d/.test(l))
  // Account number: 8–16 digits with optional dashes/spaces, not an NRIC, not a phone number, not an address line.
  const accountOf = (l: string): string | null => {
    if (isAddress(l)) return null
    const m = /(?:^|[^\d])(\d[\d -]{6,24}\d)(?=$|[^\d])/.exec(l)
    if (!m) return null
    const raw = m[1].trim()
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 8 || digits.length > 16) return null
    if (/^\d{6}-\d{2}-\d{4}$/.test(raw)) return null
    if (/^(?:\+?6)?01\d/.test(digits) && /(?:\+?6)?01\d[- ]?\d{3,4}[- ]?\d{4}/.test(raw) && !bankName) return null
    return raw.replace(/\s+/g, ' ')
  }
  let accountNo: string | null = null
  let accIdx = -1
  const order = bankIdx >= 0
    ? [bankIdx, bankIdx + 1, bankIdx - 1, bankIdx + 2, bankIdx - 2, bankIdx + 3, bankIdx - 3]
    : lines.map((_, i) => i)
  for (const i of order) {
    if (i < 0 || i >= lines.length) continue
    const a = accountOf(lines[i].replace(BANKS.find(([re]) => re.test(lines[i]))?.[0] ?? /^$/, ' '))
    if (a) { accountNo = a; accIdx = i; break }
  }

  // Account holder: a capitalised name line next to the bank / account lines.
  const isNameLine = (l: string) =>
    /^[A-Z][A-Z .'@&/-]{3,}$/.test(l) && l.split(' ').length >= 2 && !BANKS.some(([re]) => re.test(l)) && !isAddress(l) && !/\b(ACCOUNT|ACC|NO|BANK|NAME)\b\s*[:.]?$/.test(l)
  let accountHolder: string | null = null
  const anchor = accIdx >= 0 ? accIdx : bankIdx
  if (anchor >= 0) {
    for (const i of [anchor + 1, anchor - 1, anchor + 2, anchor - 2]) {
      if (i < 0 || i >= lines.length || i === bankIdx || i === accIdx) continue
      const l = lines[i].replace(/^(?:A\/?C\s*)?(?:HOLDER|NAME|ACCOUNT\s+(?:HOLDER|NAME))\s*[:.]\s*/i, '')
      if (isNameLine(l)) { accountHolder = l; break }
    }
  }

  // Address block: lines with a postcode / address words (joined in order).
  const addrLines = lines.filter((l, i) => i !== bankIdx && i !== accIdx && isAddress(l))
  const address = addrLines.length
    ? addrLines.map((l) => l.replace(/\s*,\s*/g, ', ').replace(/,\s*$/, '')).join('\n')
    : null

  if (bankName && !accountNo) warnings.push('Bank name found but no account number (8–16 digits).')
  if (accountNo && !bankName) warnings.push('Account number found but no bank name; please pick the bank.')
  if ((bankName || accountNo) && !accountHolder) warnings.push('Account holder name not found.')
  return { bankName, accountNo, accountHolder, address, warnings }
}
