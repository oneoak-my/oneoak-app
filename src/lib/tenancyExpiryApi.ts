// Supabase reads/writes for the tenancy expiry overview.

import { supabase } from './supabase'
import type { PropertyRecord, Renewal, Unit } from './types'

export const isMissingTableError = (e: unknown) => {
  const code = (e as { code?: string })?.code
  return code === 'PGRST205' || code === '42P01'
}

/** Both sources, read fresh: check-in + renewal records (with their units) and saved renewals. */
export async function getExpirySources(): Promise<{ records: (PropertyRecord & { unit: Unit | null })[]; renewals: Renewal[] }> {
  const [recs, rens] = await Promise.all([
    supabase.from('records').select('*, unit:units(*)').in('type', ['checkin', 'renewal']),
    supabase.from('renewals').select('*'),
  ])
  if (recs.error) throw recs.error
  // The renewals table is optional (older setups may not have it).
  if (rens.error && !isMissingTableError(rens.error)) throw rens.error
  return { records: (recs.data ?? []) as (PropertyRecord & { unit: Unit | null })[], renewals: (rens.error ? [] : rens.data ?? []) as Renewal[] }
}

export async function getExpiryRemarks(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('tenancy_expiry_remarks').select('source_key, remark')
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r: { source_key: string; remark: string | null }) => [r.source_key, r.remark ?? '']))
}

export async function saveExpiryRemark(sourceKey: string, remark: string): Promise<void> {
  const { error } = await supabase
    .from('tenancy_expiry_remarks')
    .upsert({ source_key: sourceKey, remark: remark.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'source_key' })
  if (error) throw error
}
