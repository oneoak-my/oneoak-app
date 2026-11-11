'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2, Plus, Camera, ImagePlus,
  FileDown, FolderArchive, RotateCcw, X, Loader2,
} from 'lucide-react'
import type { Inventory, InventoryPhoto, InventoryPhotoSection } from '@/lib/inventoryTypes'
import {
  getPhotoSections, getPhotos, createPhotoSection, updatePhotoSection, deletePhotoSection,
  uploadPhoto, updatePhotoOrder, deletePhoto, getSignedUrls, downloadPhotoBytes,
  deleteAllInventoryPhotos,
} from '@/lib/inventoryPhotosApi'
import { compressImage } from '@/lib/imageCompress'
import {
  buildPhotoPdf, buildPhotoZip, photoPdfFileName, photoZipFileName, shortUnitName, saveOrShare,
} from '@/lib/inventoryPhotoExport'
import type { PhotoExportSection } from '@/lib/inventoryPhotoExport'
import Modal from '@/components/ui/Modal'

const CONCURRENCY = 3
const FALLBACK_CHIPS = [
  'Entrance', 'Living Area', 'Dining Area & Dry Kitchen', 'Wet Kitchen', 'Bedroom 1',
  'Bathroom 1', 'Balcony', 'Keys/Access Cards/Controls',
]

interface UploadJob {
  key: string
  photoId: string
  sectionId: string
  file: File
  sortOrder: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
}

function uid(): string {
  return crypto.randomUUID()
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function bySortOrder<T extends { sort_order: number; created_at: string }>(a: T, b: T) {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
}

const iconBtn = 'flex items-center justify-center text-[#7c6f54] hover:text-[#f5f0e8] disabled:opacity-30 transition-colors'
const tap = { touchAction: 'manipulation' as const, minHeight: '36px', minWidth: '32px' }

// ── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: InventoryPhotoSection
  index: number
  total: number
  photos: InventoryPhoto[]
  urls: Record<string, string>
  pending: number
  onRename: (name: string) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onAddFiles: (files: File[]) => void
  onMovePhoto: (photoId: string, dir: -1 | 1) => void
  onDeletePhoto: (photo: InventoryPhoto) => void
}

function SectionCard({
  section, index, total, photos, urls, pending,
  onRename, onMove, onDelete, onAddFiles, onMovePhoto, onDeletePhoto,
}: SectionCardProps) {
  const [name, setName] = useState(section.name)
  useEffect(() => { setName(section.name) }, [section.name])

  function commit() {
    const v = name.trim()
    if (!v) { setName(section.name); return }
    if (v !== section.name) onRename(v)
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow picking the same file again
    if (files.length) onAddFiles(files)
  }

  return (
    <div className="bg-[#141210] border border-[#332c20] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#332c20]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-[#f5f0e8] focus:outline-none focus:border-b focus:border-gold-500/60"
        />
        <span className="text-[10px] text-[#7c6f54] shrink-0">
          {photos.length}{pending > 0 ? ` +${pending}` : ''}
        </span>
        <button onClick={() => onMove(-1)} disabled={index === 0} style={tap} className={iconBtn} aria-label="Move area up">
          <ArrowUp size={14} />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} style={tap} className={iconBtn} aria-label="Move area down">
          <ArrowDown size={14} />
        </button>
        <button onClick={onDelete} style={tap} className={`${iconBtn} hover:text-red-400`} aria-label="Delete area">
          <Trash2 size={14} />
        </button>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 p-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-[#262018]">
              {urls[p.storage_path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[p.storage_path]} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-[#7c6f54]" />
                </div>
              )}
              <span className="absolute top-1 left-1 text-[10px] font-semibold bg-black/60 text-white rounded px-1">{i + 1}</span>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55">
                <button
                  onClick={() => onMovePhoto(p.id, -1)} disabled={i === 0}
                  style={tap} className="flex items-center justify-center text-white disabled:opacity-30"
                  aria-label="Move photo earlier"
                ><ArrowLeft size={14} /></button>
                <button
                  onClick={() => onDeletePhoto(p)}
                  style={tap} className="flex items-center justify-center text-white hover:text-red-300"
                  aria-label="Delete photo"
                ><Trash2 size={14} /></button>
                <button
                  onClick={() => onMovePhoto(p.id, 1)} disabled={i === photos.length - 1}
                  style={tap} className="flex items-center justify-center text-white disabled:opacity-30"
                  aria-label="Move photo later"
                ><ArrowRight size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 p-2 border-t border-[#332c20]">
        <label
          style={{ touchAction: 'manipulation', minHeight: '44px' }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] cursor-pointer hover:bg-[#2e2719] transition-colors"
        >
          <ImagePlus size={15} />Add photos
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </label>
        <label
          style={{ touchAction: 'manipulation', minHeight: '44px' }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#262018] border border-[#332c20] text-xs text-[#f5f0e8] cursor-pointer hover:bg-[#2e2719] transition-colors"
        >
          <Camera size={15} />Take photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} />
        </label>
      </div>
    </div>
  )
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export default function PhotosTab({ inventory }: { inventory: Inventory }) {
  const inventoryId = inventory.id
  const [sections, setSections] = useState<InventoryPhotoSection[]>([])
  const [photos, setPhotos] = useState<InventoryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [newName, setNewName] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [readyFile, setReadyFile] = useState<File | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const startedRef = useRef(new Set<string>())
  const bytesCache = useRef(new Map<string, Uint8Array>())
  const objectUrls = useRef<string[]>([])

  // ── Load ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, p] = await Promise.all([getPhotoSections(inventoryId), getPhotos(inventoryId)])
        if (cancelled) return
        setSections(s)
        setPhotos(p)
        setLoading(false)
        if (p.length) {
          const signed = await getSignedUrls(p.map((x) => x.storage_path))
          if (!cancelled) setUrls((prev) => ({ ...signed, ...prev }))
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) { setError('Could not load photos. Has the photos SQL been run?'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [inventoryId])

  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)) }, [])

  const sortedSections = useMemo(() => [...sections].sort(bySortOrder), [sections])
  const photosBySection = useMemo(() => {
    const m: Record<string, InventoryPhoto[]> = {}
    for (const p of [...photos].sort(bySortOrder)) (m[p.section_id] ??= []).push(p)
    return m
  }, [photos])

  // ── Upload queue ──
  const runJob = useCallback(async (job: UploadJob) => {
    try {
      const { blob, width, height } = await compressImage(job.file)
      const row = await uploadPhoto({
        id: job.photoId, inventoryId, sectionId: job.sectionId,
        blob, width, height, sortOrder: job.sortOrder,
      })
      const url = URL.createObjectURL(blob)
      objectUrls.current.push(url)
      bytesCache.current.set(row.storage_path, new Uint8Array(await blob.arrayBuffer()))
      setUrls((prev) => ({ ...prev, [row.storage_path]: url }))
      setPhotos((prev) => [...prev, row])
      setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, status: 'done' } : j)))
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, status: 'error', error: msg } : j)))
    }
  }, [inventoryId])

  useEffect(() => {
    const active = jobs.filter((j) => j.status === 'uploading').length
    const next = jobs
      .filter((j) => j.status === 'queued' && !startedRef.current.has(j.key))
      .slice(0, Math.max(0, CONCURRENCY - active))
    if (next.length) {
      next.forEach((j) => startedRef.current.add(j.key))
      const keys = new Set(next.map((j) => j.key))
      setJobs((prev) => prev.map((j) => (keys.has(j.key) ? { ...j, status: 'uploading' } : j)))
      next.forEach((j) => { void runJob(j) })
      return
    }
    // Batch finished cleanly → reset the counter.
    if (jobs.length && jobs.every((j) => j.status === 'done')) setJobs([])
  }, [jobs, runJob])

  function enqueue(sectionId: string, files: File[]) {
    const maxExisting = Math.max(
      -1,
      ...(photosBySection[sectionId] ?? []).map((p) => p.sort_order),
      ...jobs.filter((j) => j.sectionId === sectionId).map((j) => j.sortOrder),
    )
    const newJobs: UploadJob[] = files.map((file, i) => ({
      key: uid(), photoId: uid(), sectionId, file, sortOrder: maxExisting + 1 + i, status: 'queued',
    }))
    setJobs((prev) => [...prev, ...newJobs])
  }

  function retryFailed() {
    setJobs((prev) => prev.map((j) => {
      if (j.status !== 'error') return j
      startedRef.current.delete(j.key)
      return { ...j, status: 'queued', error: undefined }
    }))
  }

  function dismissFailed() {
    setJobs((prev) => prev.filter((j) => j.status !== 'error'))
  }

  // ── Sections ──
  async function addSection(name: string) {
    const n = name.trim()
    if (!n) return
    try {
      const maxOrder = Math.max(-1, ...sections.map((s) => s.sort_order))
      const s = await createPhotoSection(inventoryId, n, maxOrder + 1)
      setSections((prev) => [...prev, s])
      setNewName('')
      setShowAdd(false)
    } catch (e) {
      console.error(e)
      setError('Could not add area.')
    }
  }

  function pickChip(chip: string) {
    setNewName((cur) => (cur.trim() ? `${cur.trim()} & ${chip}` : chip))
  }

  async function renameSection(id: string, name: string) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
    try { await updatePhotoSection(id, { name }) } catch (e) { console.error(e); setError('Rename failed.') }
  }

  async function moveSection(id: string, dir: -1 | 1) {
    const list = [...sortedSections]
    const i = list.findIndex((s) => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    const renumbered = list.map((s, idx) => ({ ...s, sort_order: idx }))
    const changed = renumbered.filter((s) => sections.find((o) => o.id === s.id)?.sort_order !== s.sort_order)
    setSections(renumbered)
    try {
      await Promise.all(changed.map((s) => updatePhotoSection(s.id, { sort_order: s.sort_order })))
    } catch (e) { console.error(e); setError('Could not save area order.') }
  }

  async function removeSection(section: InventoryPhotoSection) {
    const list = photosBySection[section.id] ?? []
    const msg = list.length
      ? `Delete "${section.name}" and its ${list.length} photo${list.length === 1 ? '' : 's'}?`
      : `Delete "${section.name}"?`
    if (!confirm(msg)) return
    setJobs((prev) => prev.filter((j) => j.sectionId !== section.id || j.status === 'uploading'))
    try {
      await deletePhotoSection(section.id, list.map((p) => p.storage_path))
      setSections((prev) => prev.filter((s) => s.id !== section.id))
      setPhotos((prev) => prev.filter((p) => p.section_id !== section.id))
    } catch (e) { console.error(e); setError('Could not delete area.') }
  }

  // ── Photos ──
  async function movePhoto(sectionId: string, photoId: string, dir: -1 | 1) {
    const list = [...(photosBySection[sectionId] ?? [])]
    const i = list.findIndex((p) => p.id === photoId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    const newOrder = new Map(list.map((p, idx) => [p.id, idx]))
    const changed = list.filter((p, idx) => p.sort_order !== idx)
    setPhotos((prev) => prev.map((p) => (newOrder.has(p.id) ? { ...p, sort_order: newOrder.get(p.id)! } : p)))
    try {
      await Promise.all(changed.map((p) => updatePhotoOrder(p.id, newOrder.get(p.id)!)))
    } catch (e) { console.error(e); setError('Could not save photo order.') }
  }

  async function removePhoto(photo: InventoryPhoto) {
    if (!confirm('Delete this photo?')) return
    try {
      await deletePhoto(photo)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
      bytesCache.current.delete(photo.storage_path)
    } catch (e) { console.error(e); setError('Could not delete photo.') }
  }

  // ── Export ──
  const unitName = shortUnitName(inventory.short_address, inventory.heading)

  async function gatherSections(): Promise<PhotoExportSection[]> {
    const ordered = sortedSections
      .map((s) => ({ name: s.name, photos: photosBySection[s.id] ?? [] }))
      .filter((s) => s.photos.length)
    const all = ordered.flatMap((s) => s.photos)
    let done = 0
    setBusy(`Fetching photos 0 of ${all.length}`)
    const queue = [...all]
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        if (!bytesCache.current.has(p.storage_path)) {
          bytesCache.current.set(p.storage_path, await downloadPhotoBytes(p.storage_path))
        }
        setBusy(`Fetching photos ${++done} of ${all.length}`)
      }
    }))
    return ordered.map((s) => ({
      name: s.name,
      photos: s.photos.map((p) => ({ bytes: bytesCache.current.get(p.storage_path)! })),
    }))
  }

  async function deliver(file: File) {
    const result = await saveOrShare(file)
    if (result === 'needs-tap') setReadyFile(file)
  }

  async function handlePdf() {
    setError(null)
    try {
      const secs = await gatherSections()
      setBusy('Building PDF…')
      const bytes = await buildPhotoPdf(unitName, secs)
      await deliver(new File([bytes as BlobPart], photoPdfFileName(unitName), { type: 'application/pdf' }))
    } catch (e) {
      console.error(e)
      setError('Could not create the PDF. Check your connection and try again.')
    } finally { setBusy(null) }
  }

  async function handleZip() {
    setError(null)
    try {
      const secs = await gatherSections()
      setBusy('Building PDF…')
      const pdf = await buildPhotoPdf(unitName, secs)
      setBusy('Zipping 0%')
      const blob = await buildPhotoZip(unitName, secs, pdf, (pct) => setBusy(`Zipping ${Math.round(pct)}%`))
      await deliver(new File([blob], photoZipFileName(unitName), { type: 'application/zip' }))
    } catch (e) {
      console.error(e)
      setError('Could not create the ZIP. Check your connection and try again.')
    } finally { setBusy(null) }
  }

  async function handleDeleteAll() {
    setConfirmDeleteAll(false)
    setBusy('Deleting photos…')
    try {
      await deleteAllInventoryPhotos(inventoryId)
      setPhotos([])
      setSections([])
      setJobs([])
      bytesCache.current.clear()
    } catch (e) {
      console.error(e)
      setError('Delete failed — some photos may remain. Try again.')
    } finally { setBusy(null) }
  }

  // ── Derived ──
  const totalBytes = photos.reduce((s, p) => s + (p.size_bytes ?? 0), 0)
  const jobsDone = jobs.filter((j) => j.status === 'done').length
  const jobsFailed = jobs.filter((j) => j.status === 'error')
  const jobsActive = jobs.some((j) => j.status === 'queued' || j.status === 'uploading')
  const usedNames = new Set(sections.map((s) => s.name.toLowerCase()))
  const areaTitles = inventory.areas.map((a) => a.title.trim()).filter(Boolean)
  const chips = Array.from(new Set(areaTitles.length ? areaTitles : FALLBACK_CHIPS))
  const exportDisabled = busy !== null || photos.length === 0

  if (loading) return <p className="text-center text-[#7c6f54] text-sm py-12">Loading photos…</p>

  return (
    <div className="space-y-4">
      {/* Summary + exports */}
      <div className="bg-[#141210] border border-[#332c20] rounded-2xl p-3 space-y-3">
        <p className="text-sm font-semibold text-gold-400">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
          <span className="text-[#7c6f54] font-normal"> · {fmtBytes(totalBytes)} stored</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={handlePdf} disabled={exportDisabled}
            style={{ touchAction: 'manipulation', minHeight: '44px' }}
            className="flex items-center justify-center gap-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0e0c08] text-sm font-semibold border border-gold-400 disabled:opacity-50 transition-colors"
          >
            <FileDown size={16} />Download Photo PDF
          </button>
          <button
            onClick={handleZip} disabled={exportDisabled}
            style={{ touchAction: 'manipulation', minHeight: '44px' }}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#262018] hover:bg-[#2e2719] text-[#f5f0e8] text-sm border border-[#332c20] disabled:opacity-50 transition-colors"
          >
            <FolderArchive size={16} />Download all photos (ZIP)
          </button>
        </div>
        {busy && (
          <p className="flex items-center gap-2 text-xs text-[#a89d84]">
            <Loader2 size={13} className="animate-spin" />{busy}
          </p>
        )}
        {readyFile && (
          <button
            onClick={async () => { const f = readyFile; setReadyFile(null); await deliver(f) }}
            style={{ touchAction: 'manipulation', minHeight: '44px' }}
            className="w-full rounded-xl border border-gold-500/40 text-gold-400 text-sm font-medium hover:bg-gold-500/10"
          >
            Ready — tap to save / share {readyFile.name}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {/* Upload progress */}
      {jobs.length > 0 && (
        <div className="rounded-xl bg-[#1e1a14] border border-[#332c20] px-3 py-2 space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#a89d84]">
            {jobsActive && <Loader2 size={13} className="animate-spin" />}
            <span className="flex-1">
              {jobsActive ? `Uploading ${Math.min(jobsDone + 1, jobs.length)} of ${jobs.length}` : `Uploaded ${jobsDone} of ${jobs.length}`}
              {jobsFailed.length > 0 && <span className="text-red-400"> · {jobsFailed.length} failed</span>}
            </span>
            {jobsFailed.length > 0 && (
              <>
                <button onClick={retryFailed} style={{ touchAction: 'manipulation', minHeight: '32px' }} className="flex items-center gap-1 text-gold-400 px-1">
                  <RotateCcw size={12} />Retry
                </button>
                {!jobsActive && (
                  <button onClick={dismissFailed} style={{ touchAction: 'manipulation', minHeight: '32px' }} className="text-[#7c6f54] px-1">
                    Dismiss
                  </button>
                )}
              </>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-[#332c20] overflow-hidden">
            <div className="h-full bg-gold-500 transition-all" style={{ width: `${(jobsDone / jobs.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Sections */}
      {sortedSections.length === 0 && (
        <p className="text-center text-sm text-[#7c6f54] py-6">No photo areas yet. Add one below, then add photos.</p>
      )}
      <div className="space-y-3">
        {sortedSections.map((s, i) => (
          <SectionCard
            key={s.id}
            section={s}
            index={i}
            total={sortedSections.length}
            photos={photosBySection[s.id] ?? []}
            urls={urls}
            pending={jobs.filter((j) => j.sectionId === s.id && j.status !== 'done').length}
            onRename={(n) => renameSection(s.id, n)}
            onMove={(d) => moveSection(s.id, d)}
            onDelete={() => removeSection(s)}
            onAddFiles={(files) => enqueue(s.id, files)}
            onMovePhoto={(pid, d) => movePhoto(s.id, pid, d)}
            onDeletePhoto={removePhoto}
          />
        ))}
      </div>

      {/* Add area */}
      {showAdd ? (
        <div className="bg-[#141210] border border-[#332c20] rounded-2xl p-3 space-y-3">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSection(newName) }}
              placeholder="Area name, e.g. Master Bedroom & Master Bathroom"
              className="flex-1 min-w-0 rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60"
            />
            {newName && (
              <button onClick={() => setNewName('')} className="text-[#7c6f54] px-1" aria-label="Clear"><X size={16} /></button>
            )}
          </div>
          <p className="text-[10px] text-[#7c6f54] uppercase tracking-wider">Tap to use · tap more to combine with “&”</p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => pickChip(c)}
                style={{ touchAction: 'manipulation', minHeight: '34px' }}
                className={`px-3 rounded-full border text-xs transition-colors ${
                  usedNames.has(c.toLowerCase())
                    ? 'border-[#332c20] text-[#5c5040]'
                    : 'border-[#3d3628] bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addSection(newName)} disabled={!newName.trim()}
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
              className="flex-1 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0e0c08] text-sm font-semibold border border-gold-400 disabled:opacity-50"
            >
              Add area
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName('') }}
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
              className="px-4 rounded-xl text-sm text-[#7c6f54] hover:text-[#f5f0e8]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{ touchAction: 'manipulation', minHeight: '48px' }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#332c20] hover:border-[#3d3628] text-[#7c6f54] hover:text-[#a89d84] text-sm transition-colors py-3"
        >
          <Plus size={16} />Add area
        </button>
      )}

      {/* Clean-up */}
      {(photos.length > 0 || sections.length > 0) && (
        <button
          onClick={() => setConfirmDeleteAll(true)}
          disabled={busy !== null || jobsActive}
          style={{ touchAction: 'manipulation', minHeight: '44px' }}
          className="w-full flex items-center justify-center gap-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 border border-red-500/30 disabled:opacity-50 transition-colors"
        >
          <Trash2 size={15} />Delete all photos
        </button>
      )}

      <Modal open={confirmDeleteAll} onClose={() => setConfirmDeleteAll(false)} title="Delete all photos?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#a89d84]">
            This deletes {photos.length} photo{photos.length === 1 ? '' : 's'} from this inventory.
            Make sure you saved the ZIP to Google Drive first.
          </p>
          <p className="text-xs text-[#7c6f54]">The photo areas are removed too. This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDeleteAll(false)}
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
              className="flex-1 rounded-xl bg-[#262018] border border-[#332c20] text-sm text-[#f5f0e8]"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAll}
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
              className="flex-1 rounded-xl bg-red-500/20 border border-red-500/30 text-sm font-semibold text-red-400"
            >
              Delete {photos.length} photo{photos.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
