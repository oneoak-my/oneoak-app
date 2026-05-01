import { supabase } from './supabase'
import type { Unit, PropertyRecord, Service, ServiceProvider, ServiceDescription, RecordType, UnitStatusTag, Task, RecordWithTasks } from './types'
import { DEFAULT_TASK_TEMPLATES } from './taskTemplates'

async function getCurrentUserEmail(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'Unknown'
}

// Extracts a readable message from Supabase PostgrestError or standard Error
export function extractError(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  if (err instanceof Error) return err.message
  return String(err)
}

// Quick connectivity + schema check
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('units').select('id').limit(1)
  if (error) return { ok: false, error: extractError(error) }
  return { ok: true }
}

// ── Units ──────────────────────────────────────────────

export async function getUnits(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('units')
    .select('*, records(id, type, tenant_name, date, status, record_status, monthly_rental, is_report_generated, move_in_date)')
    .order('building', { ascending: true })
    .order('unit_number', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getUnit(id: string): Promise<Unit | null> {
  // Split into two queries to avoid deep nesting issues with Supabase PostgREST
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('*')
    .eq('id', id)
    .single()
  if (unitError) throw unitError
  if (!unit) return null

  const { data: records, error: recordsError } = await supabase
    .from('records')
    .select('*, services(*, provider:service_providers(*))')
    .eq('unit_id', id)
    .order('date', { ascending: false })
  if (recordsError) throw recordsError

  return { ...unit, records: records ?? [] }
}

export async function createUnit(unit: Partial<Unit>): Promise<Unit> {
  const userEmail = await getCurrentUserEmail()
  const { data, error } = await supabase
    .from('units')
    .insert({ ...unit, created_by: userEmail, updated_by: userEmail })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateUnit(id: string, updates: Partial<Unit>): Promise<Unit> {
  const userEmail = await getCurrentUserEmail()
  const { data, error } = await supabase
    .from('units')
    .update({ ...updates, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await supabase.from('units').delete().eq('id', id)
  if (error) throw error
}

// ── Records ────────────────────────────────────────────

export async function getRecords(filters?: {
  type?: RecordType
  reportPending?: boolean
  statusPending?: boolean
}): Promise<(PropertyRecord & { unit: Unit })[]> {
  let query = supabase
    .from('records')
    .select('*, unit:units(*)')
    .order('date', { ascending: false })

  if (filters?.type) query = query.eq('type', filters.type)
  if (filters?.reportPending) {
    query = query.eq('status', 'active').eq('is_report_generated', false)
  } else if (filters?.statusPending) {
    query = query.eq('status', 'active')
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as (PropertyRecord & { unit: Unit })[]
}

export async function getRecord(id: string): Promise<PropertyRecord | null> {
  const { data, error } = await supabase
    .from('records')
    .select('*, unit:units(*), services(*, provider:service_providers(*))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createRecord(record: Partial<PropertyRecord>): Promise<PropertyRecord> {
  const userEmail = await getCurrentUserEmail()
  const { data, error } = await supabase
    .from('records')
    .insert({ ...record, created_by: userEmail, updated_by: userEmail })
    .select()
    .single()
  if (error) throw error

  if (record.unit_id && record.type) {
    if (record.type === 'checkin') await addUnitTag(record.unit_id, 'Check-in WIP')
    else if (record.type === 'checkout') await addUnitTag(record.unit_id, 'Check-out WIP')
  }

  console.log(`[API] createRecord succeeded: ${data.id}, type=${data.type}. Creating default tasks…`)
  await createDefaultTasks(data.id, data.type as RecordType)

  return data
}

// ── Tasks ──────────────────────────────────────────────

export async function getTasks(recordId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  console.log(`Fetching tasks for record ${recordId}, result:`, data)
  return data ?? []
}

export async function createTask(task: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(task).select().single()
  if (error) throw error
  return data
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── Unit tag helpers (internal) ─────────────────────────

async function addUnitTag(unitId: string, tag: UnitStatusTag): Promise<void> {
  const { data } = await supabase.from('units').select('status').eq('id', unitId).single()
  const current = (data?.status ?? []) as UnitStatusTag[]
  if (current.includes(tag)) return
  await supabase.from('units')
    .update({ status: [...current, tag], updated_at: new Date().toISOString() })
    .eq('id', unitId)
}

async function swapUnitTag(unitId: string, remove: UnitStatusTag, add: UnitStatusTag): Promise<void> {
  const { data } = await supabase.from('units').select('status').eq('id', unitId).single()
  const current = (data?.status ?? []) as UnitStatusTag[]
  const next = current.filter((t) => t !== remove)
  if (!next.includes(add)) next.push(add)
  await supabase.from('units')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', unitId)
}

// ── Default task creation ────────────────────────────────

export async function createDefaultTasks(recordId: string, recordType: RecordType): Promise<void> {
  if (recordType === 'renewal') return
  const templates = DEFAULT_TASK_TEMPLATES[recordType]
  if (!templates?.length) return

  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('record_id', recordId)
    .eq('is_optional', false)
    .limit(1)

  if (existing && existing.length > 0) {
    console.log(`Creating default tasks for record ${recordId} type ${recordType} — skipped, already exist`)
    return
  }

  console.log(`Creating default tasks for record ${recordId} type ${recordType}`)
  console.log(`[Tasks] Inserting ${templates.length} default tasks for record ${recordId} (${recordType})`)

  const { data, error } = await supabase.from('tasks').insert(
    templates.map((t) => ({
      record_id: recordId,
      category: t.category,
      title: t.title,
      is_optional: false,
      status: 'Open' as const,
      sort_order: t.sort_order,
      due_date: null,
      notes: null,
    }))
  ).select()

  console.log('createDefaultTasks insert result — data:', data, '| error:', error)
  if (error) {
    console.error('[Tasks] createDefaultTasks error:', error)
  } else {
    console.log(`[Tasks] Successfully created ${data?.length ?? 0} default tasks`)
  }
}

export async function getActiveRecordsWithTasks(): Promise<RecordWithTasks[]> {
  const { data, error } = await supabase
    .from('records')
    .select('*, unit:units(*), tasks(*)')
    .eq('status', 'active')
  if (error) throw error
  return ((data ?? []) as RecordWithTasks[]).filter(
    (r) => (r.tasks ?? []).some((t) => t.status !== 'Completed')
  )
}

// ── Report tracking ─────────────────────────────────────

export async function markReportGenerated(recordId: string, recordType: RecordType, unitId: string): Promise<void> {
  await supabase.from('records')
    .update({ is_report_generated: true, updated_at: new Date().toISOString() })
    .eq('id', recordId)

  if (recordType === 'checkin') {
    await swapUnitTag(unitId, 'Check-in WIP', 'Tenanted')
  } else if (recordType === 'checkout') {
    await swapUnitTag(unitId, 'Check-out WIP', 'Ready for Rent')
  }
}

export async function updateRecord(id: string, updates: Partial<PropertyRecord>): Promise<PropertyRecord> {
  const userEmail = await getCurrentUserEmail()
  const { data, error } = await supabase
    .from('records')
    .update({ ...updates, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRecord(id: string): Promise<void> {
  const { error } = await supabase.from('records').delete().eq('id', id)
  if (error) throw error
}

// ── Services ───────────────────────────────────────────

export async function createService(service: Partial<Service>): Promise<Service> {
  const userEmail = await getCurrentUserEmail()
  const { data, error } = await supabase
    .from('services')
    .insert({ ...service, created_by: userEmail, updated_by: userEmail })
    .select('*, provider:service_providers(*)')
    .single()
  if (error) throw error
  return data
}

export async function updateService(id: string, updates: Partial<Service>): Promise<Service> {
  const userEmail = await getCurrentUserEmail()
  const { data, error } = await supabase
    .from('services')
    .update({ ...updates, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, provider:service_providers(*)')
    .single()
  if (error) throw error
  return data
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw error
}

// ── Bills (outstanding services grouped by provider) ────

export async function getOutstandingServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*, provider:service_providers(*), record:records(*, unit:units(*))')
    .neq('payment_status', 'paid')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Reference data ─────────────────────────────────────

export async function getServiceProviders(): Promise<ServiceProvider[]> {
  const { data, error } = await supabase
    .from('service_providers')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getServiceDescriptions(): Promise<ServiceDescription[]> {
  const { data, error } = await supabase
    .from('service_descriptions')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ── File upload ────────────────────────────────────────

export async function uploadInvoice(file: File, serviceId: string, slot: 1 | 2 | 3 = 1): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `invoices/${serviceId}_${slot}.${ext}`
  const { error } = await supabase.storage
    .from('invoices')
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('invoices').getPublicUrl(path)
  return data.publicUrl
}

export async function getUpcomingCheckins(): Promise<(PropertyRecord & { unit: Unit; tasks: Task[] })[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('records')
    .select('*, unit:units(*), tasks(*)')
    .eq('type', 'checkin')
    .gte('move_in_date', today)
    .neq('record_status', 'Active Tenancy')
    .order('move_in_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as (PropertyRecord & { unit: Unit; tasks: Task[] })[]
}

export async function createServiceProvider(data: { name: string; bank_name?: string; bank_account?: string }): Promise<ServiceProvider> {
  const { data: result, error } = await supabase
    .from('service_providers')
    .insert({ name: data.name, bank_name: data.bank_name ?? '', bank_account: data.bank_account ?? '' })
    .select()
    .single()
  if (error) throw error
  return result
}

// ── Renewals ───────────────────────────────────────────────────────────────────

export async function getRenewalRecords(): Promise<(PropertyRecord & { unit: Unit })[]> {
  const { data, error } = await supabase
    .from('records')
    .select('*, unit:units(*)')
    .eq('type', 'checkin')
    .eq('status', 'active')
    .order('date', { ascending: false })
  if (error) throw error

  const all = (data ?? []) as (PropertyRecord & { unit: Unit })[]

  const RELEVANT_TAGS = ['Tenanted', 'Check-in WIP', 'Ready for Check-In']
  const filtered = all.filter((r) => {
    const hasTag = ((r.unit?.status ?? []) as string[]).some((t) => RELEVANT_TAGS.includes(t))
    return hasTag || r.record_status === 'Active Tenancy'
  })

  // Keep only the latest checkin per unit (data already ordered date desc)
  const seen = new Set<string>()
  return filtered.filter((r) => {
    if (seen.has(r.unit_id)) return false
    seen.add(r.unit_id)
    return true
  })
}

export async function createRenewal(data: Partial<import('./types').Renewal>): Promise<import('./types').Renewal> {
  const { data: result, error } = await supabase
    .from('renewals')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updateRenewal(id: string, data: Partial<import('./types').Renewal>): Promise<import('./types').Renewal> {
  const { data: result, error } = await supabase
    .from('renewals')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return result
}
