import { supabase } from './supabase'
import type { Inventory } from './inventoryTypes'
import { deleteAllInventoryPhotos } from './inventoryPhotosApi'

async function getUserEmail(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'Unknown'
}

export async function getInventories(): Promise<Inventory[]> {
  const { data, error } = await supabase
    .from('inventories')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Inventory[]
}

export async function getInventory(id: string): Promise<Inventory | null> {
  const { data, error } = await supabase
    .from('inventories')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Inventory | null
}

export async function createInventory(inv: Partial<Inventory>): Promise<Inventory> {
  const email = await getUserEmail()
  const { data, error } = await supabase
    .from('inventories')
    .insert({ ...inv, created_by: email, updated_by: email })
    .select()
    .single()
  if (error) throw error
  return data as Inventory
}

export async function saveInventory(id: string, updates: Partial<Inventory>): Promise<Inventory> {
  const email = await getUserEmail()
  const { data, error } = await supabase
    .from('inventories')
    .update({ ...updates, updated_by: email, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Inventory
}

export async function deleteInventory(id: string): Promise<void> {
  // Storage files are not covered by the FK cascade, so remove them first.
  try {
    await deleteAllInventoryPhotos(id)
  } catch (e) {
    // Photos tables not created yet → nothing to clean up. Anything else must stop the delete.
    const code = (e as { code?: string })?.code
    if (code !== 'PGRST205' && code !== '42P01') throw e
  }
  const { error } = await supabase.from('inventories').delete().eq('id', id)
  if (error) throw error
}

// ── Brands ─────────────────────────────────────────────────────────────────────

export interface InventoryBrand {
  id: string
  brand_group: string
  name: string
}

export async function getBrands(): Promise<InventoryBrand[]> {
  const { data, error } = await supabase
    .from('inventory_brands')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as InventoryBrand[]
}

export async function addBrand(brand_group: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_brands')
    .upsert({ brand_group, name }, { onConflict: 'brand_group,name' })
  if (error) throw error
}
