import type { PropertyRecord, RecordType, Unit } from './types'

// ── Config (edit freely) ──────────────────────────────────────────────────────

// Recipients per building (keys match BUILDINGS in types.ts).
export const BUILDING_EMAILS: Record<string, string[]> = {
  'Ooak Residence':    ['ooakresidence.mgmt@gmail.com', 'ynhu.invoice@ynhutility.com'],
  'Ooak Suites':       ['ooaksuites.mgmt@gmail.com', 'ynhu.invoice@ynhutility.com'],
  'Allevia Residence': ['residensiallevia@gmail.com'],
  'South Brooks':      ['mo.southbrooks@gmail.com'],
  'Astrea':            ['residensiastrea@gmail.com'],
  'Trinity Pentamont': ['pentamont@henrybutchermk.com'],
  'i-Zen 2':           ['izenkiara2.mgmt@gmail.com'],
  'Sunway Mont':       ['management@sunwaymontresidences.com'],
  'Arcoris':           ['mk20.arcoris@gmail.com'],
  'Other':             [],
}

export const GMAIL_ACCOUNT = 'ad.oneoak@gmail.com'

// Gmail does not add the signature to pre-filled compose links, so it goes in the body.
export const INCLUDE_SIGNATURE = true
export const SIGNATURE = [
  'Best Regards,',
  'Elleen | Business Operations | Corporate Leasing',
  'One Oak Group | Reapfield Properties (HQ) | KW Malaysia',
  'Mobile +60 16 7000 669 Email ad.oneoak@gmail.com',
].join('\n')

// Default task titles that carry the meter-reading request.
export const METER_TASK_TITLES: Partial<Record<RecordType, string>> = {
  checkin: 'Request Meter Reading',
  checkout: 'Request Meter Reading & Bills',
}

const OOAK_BUILDINGS = ['Ooak Residence', 'Ooak Suites']

// ── Date helpers (local dates only, never new Date('YYYY-MM-DD')) ────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toYmd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** "14 Nov 2026" */
export function formatAsOf(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Wed 18 Nov" */
export function formatSendDay(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function todayYmd(): string {
  return toYmd(new Date())
}

// ── Request date / time ──────────────────────────────────────────────────────

export type MeterRequestTime = '9:00am' | '4:00pm'

export function computeMeterRequest(
  recordType: RecordType,
  dateStr: string,
): { requestDate: string; time: MeterRequestTime } {
  const d = parseLocalDate(dateStr)
  if (recordType === 'checkout') {
    // On the move-out day at 4pm; a Sunday move-out rolls to Monday.
    const req = d.getDay() === 0 ? addDays(d, 1) : d
    return { requestDate: toYmd(req), time: '4:00pm' }
  }
  // Check-in: the day before at 9am (Sunday move-in → Saturday, Monday → Sunday).
  return { requestDate: toYmd(addDays(d, -1)), time: '9:00am' }
}

/** The date the meter request is based on: move-in date for check-in, record date otherwise. */
export function meterBaseDate(record: Pick<PropertyRecord, 'type' | 'date' | 'move_in_date'>): string {
  return record.type === 'checkin' ? (record.move_in_date ?? record.date) : record.date
}

export function meterRequestForRecord(record: Pick<PropertyRecord, 'type' | 'date' | 'move_in_date'>) {
  return computeMeterRequest(record.type, meterBaseDate(record))
}

// ── Email ────────────────────────────────────────────────────────────────────

export function buildMeterEmail(
  record: Pick<PropertyRecord, 'type' | 'date' | 'move_in_date'>,
  unit: Pick<Unit, 'building' | 'unit_number'>,
): { to: string[]; subject: string; body: string; gmailUrl: string; mailtoUrl: string } {
  const { requestDate } = meterRequestForRecord(record)
  const date = formatAsOf(requestDate)
  const u = unit.unit_number
  const isMoveIn = record.type === 'checkin'
  const to = BUILDING_EMAILS[unit.building] ?? []

  let subject: string
  let lines: string[]

  if (OOAK_BUILDINGS.includes(unit.building)) {
    subject = isMoveIn
      ? `[${u} Ooak] Request Move-In Meter Reading & Outstanding Statement`
      : `[${u} Ooak] Request Move-out Meter Reading & Statement`
    lines = [
      'Dear management / utility,',
      '',
      `Kindly provide the following details for unit ${u} Ooak:`,
      '',
      `1. Water & Electricity Meter Reading as of ${date}.`,
      '2. Invoice as of the latest month. (for me to calculate usage)',
      "3. Outstanding Statement if there's any outstanding prior to the current month.",
      '',
      'I’ll assist by informing the owner/tenant accordingly.',
      '',
      'Thanks.',
    ]
  } else {
    subject = isMoveIn
      ? `[${u}] Request Move-In Meter Reading & Outstanding Statement`
      : `[${u}] Request Move-Out Meter Reading & Outstanding Statement`
    lines = [
      'Dear management,',
      '',
      `Kindly provide the following details for Unit No. ${u}:`,
      '',
      `1. Water & Electricity Meter Reading as of ${date}`,
      '2. Invoice of the latest water bill. (if applicable)',
      "3. Outstanding Water bill statement if there's any outstanding prior to the current month. (if applicable)",
      '',
      'I’ll assist by informing the owner/tenant accordingly.',
      '',
      'Thanks.',
    ]
  }

  let body = lines.join('\n')
  if (INCLUDE_SIGNATURE) body += `\n\n${SIGNATURE}`

  const gmailUrl =
    'https://mail.google.com/mail/?authuser=' + encodeURIComponent(GMAIL_ACCOUNT) +
    '&view=cm&fs=1&to=' + encodeURIComponent(to.join(',')) +
    '&su=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(body)

  // Phones: hand off to the native mail app. CRLF line breaks per RFC 6068.
  const mailtoUrl =
    'mailto:' + to.join(',') +
    '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(body.replace(/\n/g, '\r\n'))

  return { to, subject, body, gmailUrl, mailtoUrl }
}

/** True on phones/tablets, including iPads that report a Mac user agent. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1
}
