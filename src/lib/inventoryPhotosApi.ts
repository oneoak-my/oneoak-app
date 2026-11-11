import { supabase } from './supabase'
import type { InventoryPhoto, InventoryPhotoSection } from './inventoryTypes'

export const PHOTO_BUCKET = 'inventory-photos'

// ── Sections ─────────────────────────────────────────────────────────────────

export async function getPhotoSections(inventoryId: string): Promise<InventoryPhotoSection[]> {
  const { data, error } = await supabase
    .from('inventory_photo_sections')
    .select('*')
    .eq('inventory_id', inventoryId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as InventoryPhotoSection[]
}

export async function createPhotoSection(
  inventoryId: string, name: string, sortOrder: number,
): Promise<InventoryPhotoSection> {
  const { data, error } = await supabase
    .from('inventory_photo_sections')
    .insert({ inventory_id: inventoryId, name, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data as InventoryPhotoSection
}

export async function updatePhotoSection(
  id: string, updates: Partial<Pick<InventoryPhotoSection, 'name' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase.from('inventory_photo_sections').update(updates).eq('id', id)
  if (error) throw error
}

/** Deletes the section's files from storage, then the section row (photo rows cascade). */
export async function deletePhotoSection(id: string, photoPaths: string[]): Promise<void> {
  await removeStorageFiles(photoPaths)
  const { error } = await supabase.from('inventory_photo_sections').delete().eq('id', id)
  if (error) throw error
}

// ── Photos ───────────────────────────────────────────────────────────────────

export async function getPhotos(inventoryId: string): Promise<InventoryPhoto[]> {
  const { data, error } = await supabase
    .from('inventory_photos')
    .select('*')
    .eq('inventory_id', inventoryId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as InventoryPhoto[]
}

export function photoPath(inventoryId: string, sectionId: string, photoId: string): string {
  return `${inventoryId}/${sectionId}/${photoId}.jpg`
}

/** Uploads the (already compressed) JPEG, then inserts its row. Rolls back the file if the insert fails. */
export async function uploadPhoto(args: {
  id: string
  inventoryId: string
  sectionId: string
  blob: Blob
  width: number
  height: number
  sortOrder: number
}): Promise<InventoryPhoto> {
  const path = photoPath(args.inventoryId, args.sectionId, args.id)
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, args.blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('inventory_photos')
    .insert({
      id: args.id,
      section_id: args.sectionId,
      inventory_id: args.inventoryId,
      storage_path: path,
      width: args.width,
      height: args.height,
      size_bytes: args.blob.size,
      sort_order: args.sortOrder,
    })
    .select()
    .single()
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
    throw error
  }
  return data as InventoryPhoto
}

export async function updatePhotoOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('inventory_photos').update({ sort_order: sortOrder }).eq('id', id)
  if (error) throw error
}

export async function deletePhoto(photo: InventoryPhoto): Promise<void> {
  await removeStorageFiles([photo.storage_path])
  const { error } = await supabase.from('inventory_photos').delete().eq('id', photo.id)
  if (error) throw error
}

/** Signed URLs (1 hour) for thumbnails, keyed by storage path. */
export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100)
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(chunk, 3600)
    if (error) throw error
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) out[d.path] = d.signedUrl
    }
  }
  return out
}

export async function downloadPhotoBytes(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}

// ── Bulk clean-up ────────────────────────────────────────────────────────────

async function removeStorageFiles(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

/** Lists every file under {inventoryId}/ in the bucket (catches orphans that have no DB row). */
async function listInventoryFiles(inventoryId: string): Promise<string[]> {
  async function listAll(prefix: string) {
    const entries: { name: string; id: string | null }[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .list(prefix, { limit: 1000, offset })
      if (error) throw error
      entries.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return entries
  }
  const paths: string[] = []
  for (const folder of await listAll(inventoryId)) {
    if (folder.id) { paths.push(`${inventoryId}/${folder.name}`); continue } // stray file
    for (const f of await listAll(`${inventoryId}/${folder.name}`)) {
      if (f.id) paths.push(`${inventoryId}/${folder.name}/${f.name}`)
    }
  }
  return paths
}

/** Removes all photo files, photo rows and section rows for an inventory. */
export async function deleteAllInventoryPhotos(inventoryId: string): Promise<void> {
  const { data, error } = await supabase
    .from('inventory_photos')
    .select('storage_path')
    .eq('inventory_id', inventoryId)
  if (error) throw error
  const dbPaths = (data ?? []).map((r: { storage_path: string }) => r.storage_path)
  const listed = await listInventoryFiles(inventoryId)
  await removeStorageFiles(Array.from(new Set([...dbPaths, ...listed])))

  const { error: pErr } = await supabase.from('inventory_photos').delete().eq('inventory_id', inventoryId)
  if (pErr) throw pErr
  const { error: sErr } = await supabase.from('inventory_photo_sections').delete().eq('inventory_id', inventoryId)
  if (sErr) throw sErr
}
