// Supabase access for tenancy agreement drafts (table tenancy_agreements, RLS: authenticated users only).

import { supabase } from '../supabase'
import type { TenancyAgreementRow, TenancyData } from './types'
import { emptyTenancyData } from './types'
import { DEFAULT_TEMPLATE_ID } from './templates'

const TABLE = 'tenancy_agreements'

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

/** True when the error means the table has not been created yet (SQL not run). */
export function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  return code === 'PGRST205' || code === '42P01'
}

export async function listAgreements(): Promise<TenancyAgreementRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, unit_id, template_id, title, created_by, updated_by, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, data: null })) as TenancyAgreementRow[]
}

export async function getAgreement(id: string): Promise<TenancyAgreementRow | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as TenancyAgreementRow | null
}

export async function createAgreement(
  init: { title?: string; unit_id?: string | null; template_id?: string; data?: TenancyData } = {},
): Promise<TenancyAgreementRow> {
  const uid = await userId()
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      title: init.title ?? 'Untitled draft',
      unit_id: init.unit_id ?? null,
      template_id: init.template_id ?? DEFAULT_TEMPLATE_ID,
      data: init.data ?? emptyTenancyData(),
      created_by: uid,
      updated_by: uid,
    })
    .select()
    .single()
  if (error) throw error
  return data as TenancyAgreementRow
}

export async function saveAgreement(
  id: string,
  updates: Partial<Pick<TenancyAgreementRow, 'title' | 'unit_id' | 'template_id'>> & { data?: TenancyData },
): Promise<void> {
  const uid = await userId()
  const { error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_by: uid, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function duplicateAgreement(id: string): Promise<TenancyAgreementRow> {
  const src = await getAgreement(id)
  if (!src) throw new Error('Draft not found')
  return createAgreement({
    title: `${src.title || 'Untitled draft'} (copy)`,
    unit_id: src.unit_id,
    template_id: src.template_id,
    data: src.data as TenancyData,
  })
}

export async function deleteAgreement(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

export interface UnitLite { id: string; unit_number: string; building: string }

export async function listUnitsLite(): Promise<UnitLite[]> {
  const { data, error } = await supabase.from('units').select('id, unit_number, building').order('unit_number')
  if (error) throw error
  return (data ?? []) as UnitLite[]
}
