// Data typed into a tenancy agreement draft (stored as tenancy_agreements.data jsonb).
// Every field is optional text so a half-filled draft always saves and always prints.

export type IdType = 'NRIC' | 'Passport'

export interface PersonId {
  name: string
  idType: IdType
  idNo: string
}

export interface Landlord extends PersonId {
  address: string
}

export interface Occupant {
  name: string
  idNo: string
}

export interface Tenant extends PersonId {
  kind: 'individual' | 'company'
  nationality: string
  dob: string // yyyy-mm-dd
  gender: '' | 'Male' | 'Female'
  companyName: string
  companyNo: string
  occupants: Occupant[]
  /** Company tenants: the person who signs for the company (optional). */
  signatory: PersonId
}

export interface ExtraClause {
  id: string
  margin: string
  text: string
}

export interface TenancyData {
  agreementDate: string
  landlords: Landlord[]
  tenants: Tenant[]
  premises: string
  commencing: string
  terminating: string
  term: string
  /** Which side was typed last: 'term' → the end date follows start + term; otherwise the term follows the dates. */
  termFrom?: 'dates' | 'term'
  monthlyRent: string
  /** Day of month the rent is due; '' = the commencing day. */
  dueDay: string
  bankName: string
  accountNo: string
  accountHolder: string
  securityDeposit: string
  /** Months text shown in the schedule; null = calculated from deposit ÷ rent. */
  securityMonths: string | null
  utilityDeposit: string
  utilityMonths: string | null
  optionToRenew: string
  useOfPremises: string
  accessCardAmount: string
  accessCardDetails: string
  landlordWitness: PersonId
  tenantWitness: PersonId
  /** Schedule II signing names; null = the witness names. */
  schedIILandlordName: string | null
  schedIITenantName: string | null
  extraClauses: ExtraClause[]
}

export interface TenancyAgreementRow {
  id: string
  unit_id: string | null
  template_id: string
  title: string | null
  data: Partial<TenancyData> | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const DEFAULT_OPTION_TO_RENEW = 'One ( 1 ) year at a rental to be mutually agreed upon.'
export const DEFAULT_USE = 'Residential purpose only.'

export const emptyPerson = (): PersonId => ({ name: '', idType: 'NRIC', idNo: '' })
export const emptyLandlord = (): Landlord => ({ ...emptyPerson(), address: '' })
export const emptyTenant = (): Tenant => ({
  ...emptyPerson(), kind: 'individual', nationality: '', dob: '', gender: '',
  companyName: '', companyNo: '', occupants: [], signatory: emptyPerson(),
})

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function emptyTenancyData(): TenancyData {
  return {
    agreementDate: '',
    landlords: [emptyLandlord()],
    tenants: [emptyTenant()],
    premises: '',
    commencing: '',
    terminating: '',
    term: '',
    monthlyRent: '',
    dueDay: '',
    bankName: '',
    accountNo: '',
    accountHolder: '',
    securityDeposit: '',
    securityMonths: null,
    utilityDeposit: '',
    utilityMonths: null,
    optionToRenew: DEFAULT_OPTION_TO_RENEW,
    useOfPremises: DEFAULT_USE,
    accessCardAmount: '',
    accessCardDetails: '',
    landlordWitness: emptyPerson(),
    tenantWitness: emptyPerson(),
    schedIILandlordName: null,
    schedIITenantName: null,
    extraClauses: [],
  }
}

/** Fills missing keys of a stored draft (older drafts, partial JSON) with defaults. */
export function normaliseTenancyData(raw: Partial<TenancyData> | null | undefined): TenancyData {
  const base = emptyTenancyData()
  const d = { ...base, ...(raw ?? {}) } as TenancyData
  d.landlords = (raw?.landlords?.length ? raw.landlords : base.landlords).map((l) => ({ ...emptyLandlord(), ...l }))
  d.tenants = (raw?.tenants?.length ? raw.tenants : base.tenants).map((t) => ({
    ...emptyTenant(), ...t,
    occupants: (t.occupants ?? []).map((o) => ({ ...o, name: o.name ?? '', idNo: o.idNo ?? '' })),
    signatory: { ...emptyPerson(), ...(t.signatory ?? {}) },
  }))
  d.landlordWitness = { ...emptyPerson(), ...(raw?.landlordWitness ?? {}) }
  d.tenantWitness = { ...emptyPerson(), ...(raw?.tenantWitness ?? {}) }
  d.extraClauses = (raw?.extraClauses ?? []).map((c) => ({ id: c.id || newId(), margin: c.margin ?? '', text: c.text ?? '' }))
  return d
}

/** Individual tenant needs Nationality / DOB / Gender when on a passport or not Malaysian. */
export function isForeignTenant(t: Tenant): boolean {
  if (t.kind !== 'individual') return false
  if (t.idType === 'Passport') return true
  const n = t.nationality.trim().toLowerCase()
  return n !== '' && n !== 'malaysian' && n !== 'malaysia'
}
