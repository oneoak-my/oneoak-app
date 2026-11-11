import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
import JSZip from 'jszip'
import {
  PAGE_W, PAGE_H, MARGIN, LABEL_SIZE, layoutPhotoPages,
} from './photoLayout'

export interface PhotoExportSection {
  name: string
  photos: { bytes: Uint8Array }[]
}

// ── Naming ───────────────────────────────────────────────────────────────────

/** "A-17-3a Ooak Residence | Inventory list" → "A-17-3a Ooak Residence" */
export function shortUnitName(shortAddress: string | null | undefined, heading?: string | null): string {
  const base = shortAddress?.trim() || heading?.split(',')[0]?.trim() || 'Unit'
  return base.replace(/\s*\|\s*Inventory list\s*$/i, '').trim() || 'Unit'
}

/** Replaces / \ : * ? " < > | and & with "-" (and trims stray dots/spaces). */
export function fileSafe(name: string): string {
  return name
    .replace(/[/\\:*?"<>|&]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '') || 'Untitled'
}

export function photoPdfFileName(unit: string): string {
  return `${fileSafe(unit).replace(/\s+/g, '_')}_Inventory_Photos.pdf`
}

export function photoZipFileName(unit: string): string {
  return `${fileSafe(unit)} Inventory Photos.zip`
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/** Standard fonts only cover WinAnsi; replace anything else so drawText never throws. */
function encodable(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet())
  return Array.from(text).map((ch) => (set.has(ch.codePointAt(0)!) ? ch : '?')).join('')
}

export async function buildPhotoPdf(unitName: string, sections: PhotoExportSection[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${unitName} Inventory Photos`)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const black = rgb(0, 0, 0)

  const used = sections.filter((s) => s.photos.length > 0)
  // Embed each JPEG once, as-is (no re-encode). Its own pixel size drives the layout.
  const images = await Promise.all(used.map((s) => Promise.all(s.photos.map((p) => doc.embedJpg(p.bytes)))))
  const pages = layoutPhotoPages(used.map((s, si) => ({
    name: s.name,
    photos: images[si]!.map((img) => ({ width: img.width, height: img.height })),
  })))

  const title = 'INVENTORY PHOTOS'
  const titleSize = 10
  // Keep the unit code as typed ("A-17-3a"), uppercase the building name.
  const [code = '', ...rest] = unitName.split(/\s+/)
  const unitText = encodable(regular, [code, ...rest.map((w) => w.toUpperCase())].join(' ').trim())
  const headerBaseline = PAGE_H - MARGIN + 12
  const titleW = bold.widthOfTextAtSize(title, titleSize)
  const titleRight = (PAGE_W + titleW) / 2
  // Shrink the unit name if it would collide with the centred title.
  let unitSize = 8
  while (unitSize > 5 && PAGE_W - MARGIN - regular.widthOfTextAtSize(unitText, unitSize) < titleRight + 8) unitSize -= 0.5

  for (const lp of pages) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    page.drawText(title, { x: (PAGE_W - titleW) / 2, y: headerBaseline, size: titleSize, font: bold, color: black })
    page.drawText(unitText, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(unitText, unitSize),
      y: headerBaseline, size: unitSize, font: regular, color: black,
    })
    for (const l of lp.labels) {
      page.drawText(encodable(bold, l.text), { x: l.x, y: l.baseline, size: LABEL_SIZE, font: bold, color: black })
    }
    for (const p of lp.photos) {
      page.drawImage(images[p.sectionIndex]![p.photoIndex]!, { x: p.x, y: p.y, width: p.w, height: p.h })
    }
  }
  return doc.save()
}

// ── ZIP ──────────────────────────────────────────────────────────────────────

export async function buildPhotoZip(
  unitName: string,
  sections: PhotoExportSection[],
  pdfBytes: Uint8Array,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const zip = new JSZip()
  zip.file(photoPdfFileName(unitName), pdfBytes)
  const usedFolders = new Set<string>()
  for (const s of sections) {
    if (s.photos.length === 0) continue
    const base = fileSafe(s.name)
    let folder = base
    for (let n = 2; usedFolders.has(folder.toLowerCase()); n++) folder = `${base} (${n})`
    usedFolders.add(folder.toLowerCase())
    s.photos.forEach((p, i) => {
      zip.file(`${folder}/${folder} ${String(i + 1).padStart(2, '0')}.jpg`, p.bytes)
    })
  }
  // JPEGs don't compress further; STORE keeps zipping fast on phones.
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE', mimeType: 'application/zip' },
    (meta) => onProgress?.(meta.percent),
  )
}

// ── Save / share ─────────────────────────────────────────────────────────────

export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * On phones: share sheet if supported, else download. Returns 'needs-tap' if the
 * browser refused share because the user gesture expired (long build) — the
 * caller should show a button that calls this again from a fresh tap.
 */
export async function saveOrShare(file: File): Promise<'done' | 'needs-tap'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (isPhone() && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name })
      return 'done'
    } catch (e) {
      const name = (e as { name?: string })?.name
      if (name === 'AbortError') return 'done' // user closed the sheet
      if (name === 'NotAllowedError') return 'needs-tap'
      // fall through to download
    }
  }
  downloadFile(file)
  return 'done'
}
