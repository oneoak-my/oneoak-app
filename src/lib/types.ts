// ── Task types ────────────────────────────────────────────────────────────────

export type TaskStatus = 'Open' | 'In Progress' | 'Completed'
export type TaskCategory = 'default' | 'tenant_request' | 'repair' | 'todo' | 'type_of_repair'

export interface Task {
  id: string
  record_id: string
  category: TaskCategory
  title: string
  is_optional: boolean
  status: TaskStatus
  due_date: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Record types ──────────────────────────────────────────────────────────────

export type RecordType = 'checkin' | 'checkout' | 'maintenance'
export type RecordStatus = 'active' | 'completed'
export type PaymentStatus = 'unpaid' | 'proof_sent' | 'paid'
export type UtilityStatus = 'No Outstanding' | 'Have Outstanding'

export const RECORD_STATUS_OPTIONS: Record<RecordType, string[]> = {
  checkin:     ['Open', 'In Progress', 'Ready for Check In', 'Active Tenancy'],
  checkout:    ['Open', 'In Progress', 'Ready for Rent'],
  maintenance: ['Open', 'Scheduled', 'In Progress', 'Completed'],
}

export const RECORD_STATUS_COLORS: Record<string, string> = {
  'Open':               'bg-[#332c20] text-[#a89d84] border-[#3d3628]',
  'In Progress':        'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Scheduled':          'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Ready for Check In': 'bg-gold-500/20 text-gold-300 border-gold-500/30',
  'Active Tenancy':     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Ready for Rent':     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Completed':          'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

// ── Unit status tags (multi-tag system) ───────────────────────────────────────

export type UnitStatusTag =
  | 'Check-in WIP'
  | 'Check-out WIP'
  | 'Ready for Check-In'
  | 'Tenanted'
  | 'Ready for Rent'
  | 'Sold'

export type BadgeVariant = 'gold' | 'green' | 'red' | 'orange' | 'gray' | 'blue' | 'purple' | 'yellow'

export const ALL_UNIT_TAGS: UnitStatusTag[] = [
  'Check-in WIP',
  'Check-out WIP',
  'Ready for Check-In',
  'Tenanted',
  'Ready for Rent',
  'Sold',
]

export const UNIT_TAG_STYLES: Record<UnitStatusTag, { variant: BadgeVariant; label: string }> = {
  'Check-in WIP':     { variant: 'blue',   label: 'Check-in WIP' },
  'Check-out WIP':    { variant: 'orange', label: 'Check-out WIP' },
  'Ready for Check-In': { variant: 'gold', label: 'Ready for Check-In' },
  'Tenanted':         { variant: 'green',  label: 'Tenanted' },
  'Ready for Rent':   { variant: 'yellow', label: 'Ready for Rent' },
  'Sold':             { variant: 'gray',   label: 'Sold' },
}

// ── Data models ───────────────────────────────────────────────────────────────

export const LISTER_OPTIONS = ['Tony Ong', 'Vivian', 'Others'] as const
export type Lister = typeof LISTER_OPTIONS[number]

export interface Unit {
  id: string
  building: string
  unit_number: string
  notes: string | null
  status: UnitStatusTag[]
  lister: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  records?: PropertyRecord[]
}

export interface PropertyRecord {
  id: string
  unit_id: string
  type: RecordType
  tenant_name: string | null
  date: string
  monthly_rental: number | null
  security_deposit: number | null
  utility_deposit: number | null
  notes: string | null
  status: RecordStatus
  move_in_date: string | null
  tenancy_start_date: string | null
  tenancy_end_date: string | null
  is_report_generated: boolean
  electricity_status: UtilityStatus | null
  water_status: UtilityStatus | null
  indah_water_status: UtilityStatus | null
  gas_status: UtilityStatus | null
  tenant_bank_name: string | null
  tenant_bank_account: string | null
  tenant_bank_holder: string | null
  record_status: string | null
  appointment_time: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  unit?: Unit
  services?: Service[]
  tasks?: Task[]
}

export type RecordWithTasks = PropertyRecord & { unit: Unit; tasks: Task[] }

export interface ServiceProvider {
  id: string
  name: string
  bank_name: string
  bank_account: string
  created_at: string
}

export interface ServiceDescription {
  id: string
  description: string
  sort_order: number
  created_at: string
}

export interface Service {
  id: string
  record_id: string
  description: string
  provider_id: string | null
  amount: number
  payment_by: PaymentBy
  invoice_url: string | null
  invoice_url_2: string | null
  invoice_url_3: string | null
  payment_status: PaymentStatus
  payment_proof_url: string | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  provider?: ServiceProvider
  record?: PropertyRecord
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const BUILDINGS = [
  'Ooak Suites',
  'Ooak Residence',
  'Allevia Residence',
  'South Brooks',
  'i-Zen 2',
  'Arcoris',
  'Trinity Pentamont',
  'Sunway Mont',
  'Astrea',
  'Other',
] as const

export const RECORD_TYPE_LABELS: { [K in RecordType]: string } = {
  checkin: 'Check-in',
  checkout: 'Check-out',
  maintenance: 'Maintenance',
}

export const PAYMENT_STATUS_LABELS: { [K in PaymentStatus]: string } = {
  unpaid: 'Unpaid',
  proof_sent: 'Proof Sent',
  paid: 'Paid',
}

export const UTILITY_OPTIONS: { value: UtilityStatus; label: string }[] = [
  { value: 'No Outstanding', label: 'No Outstanding' },
  { value: 'Have Outstanding', label: 'Have Outstanding' },
]

// ── Payment method ────────────────────────────────────────────────────────────

export type PaymentBy =
  | 'Deduct from Deposit'
  | 'Deduct from Deposit + Pay by One Oak'
  | 'Pay by Owner'
  | 'Pay by One Oak'
  | 'Tenant Pay Direct'

export const PAYMENT_BY_CHECKOUT: PaymentBy[] = [
  'Deduct from Deposit',
  'Deduct from Deposit + Pay by One Oak',
  'Pay by Owner',
  'Pay by One Oak',
  'Tenant Pay Direct',
]

export const PAYMENT_BY_OTHER: PaymentBy[] = [
  'Pay by Owner',
  'Pay by One Oak',
  'Tenant Pay Direct',
]

export const PAYMENT_BY_COLORS: Record<PaymentBy, string> = {
  'Deduct from Deposit':                  'bg-red-500/15 text-red-400 border border-red-500/25',
  'Deduct from Deposit + Pay by One Oak': 'bg-violet-500/15 text-violet-400 border border-violet-500/25',
  'Pay by Owner':                         'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  'Pay by One Oak':                       'bg-purple-500/15 text-purple-400 border border-purple-500/25',
  'Tenant Pay Direct':                    'bg-orange-500/15 text-orange-400 border border-orange-500/25',
}
