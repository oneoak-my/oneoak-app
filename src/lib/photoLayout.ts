// Pure layout engine for the Inventory Photos PDF. No DOM / pdf-lib dependency
// so it can be unit-tested in Node.

export const PAGE_W = 595.28
export const PAGE_H = 841.89
export const MARGIN = 36
export const CONTENT_W = PAGE_W - MARGIN * 2
export const CONTENT_TOP = PAGE_H - MARGIN // pdf coordinates: y grows upward
export const CONTENT_BOTTOM = MARGIN

export const PHOTO_GAP = 4
export const ROW_GAP = 4
export const TARGET_ROW_H = 150
export const MAX_ROW_H = TARGET_ROW_H * 1.3
export const LABEL_SIZE = 8
export const LABEL_H = 13 // label text + space before first row
export const SECTION_GAP = 10 // extra space before a new section on the same page

export interface LayoutPhotoInput { width: number; height: number }
export interface LayoutSectionInput { name: string; photos: LayoutPhotoInput[] }

export interface PlacedPhoto {
  sectionIndex: number
  photoIndex: number
  x: number; y: number; w: number; h: number // y = bottom edge (pdf coords)
}
export interface PlacedLabel { sectionIndex: number; text: string; x: number; baseline: number; top: number; bottom: number }
export interface LayoutPage { labels: PlacedLabel[]; photos: PlacedPhoto[] }

interface Row { photoIdxs: number[]; h: number; justified: boolean }

function aspect(p: LayoutPhotoInput): number {
  return p.width > 0 && p.height > 0 ? p.width / p.height : 4 / 3
}

function justifiedHeight(aspects: number[], width: number): number {
  const sum = aspects.reduce((s, a) => s + a, 0)
  return (width - PHOTO_GAP * (aspects.length - 1)) / sum
}

/**
 * Greedy justified rows: keep adding photos while the justified row height stays
 * at or above the target. When the next photo would push it below the target the
 * row is closed — unless the row without it would be absurdly tall (> MAX_ROW_H,
 * e.g. one portrait followed by a panorama), in which case the photo is included.
 * Any row that would still be taller than MAX_ROW_H (typically the last row) is
 * drawn at the target height, left aligned, instead of being stretched.
 */
export function packRows(photos: LayoutPhotoInput[], width = CONTENT_W, target = TARGET_ROW_H): Row[] {
  const rows: Row[] = []
  let cur: number[] = []
  for (let i = 0; i < photos.length; i++) {
    const withNext = [...cur, i]
    const hWith = justifiedHeight(withNext.map((j) => aspect(photos[j]!)), width)
    if (cur.length === 0 || hWith >= target) { cur = withNext; continue }
    const hWithout = justifiedHeight(cur.map((j) => aspect(photos[j]!)), width)
    if (hWithout > MAX_ROW_H) { cur = withNext; continue }
    rows.push({ photoIdxs: cur, h: hWithout, justified: true })
    cur = [i]
  }
  if (cur.length) {
    const h = justifiedHeight(cur.map((j) => aspect(photos[j]!)), width)
    rows.push({ photoIdxs: cur, h, justified: true })
  }
  for (const r of rows) {
    if (r.h > MAX_ROW_H) { r.h = target; r.justified = false }
  }
  return rows
}

export function layoutPhotoPages(sections: LayoutSectionInput[]): LayoutPage[] {
  const pages: LayoutPage[] = []
  let page: LayoutPage = { labels: [], photos: [] }
  pages.push(page)
  let y = CONTENT_TOP
  let pageEmpty = true

  function newPage() {
    page = { labels: [], photos: [] }
    pages.push(page)
    y = CONTENT_TOP
    pageEmpty = true
  }

  function placeLabel(sectionIndex: number, text: string) {
    page.labels.push({
      sectionIndex, text, x: MARGIN,
      baseline: y - LABEL_SIZE * 0.8, top: y, bottom: y - LABEL_H,
    })
    y -= LABEL_H
    pageEmpty = false
  }

  sections.forEach((section, si) => {
    if (section.photos.length === 0) return
    const rows = packRows(section.photos)

    // Section start: needs room for the label plus at least its first row.
    const gapBefore = pageEmpty ? 0 : SECTION_GAP
    if (y - gapBefore - LABEL_H - rows[0]!.h < CONTENT_BOTTOM) newPage()
    else y -= gapBefore
    placeLabel(si, section.name)

    rows.forEach((row, ri) => {
      const gap = ri === 0 ? 0 : ROW_GAP
      if (y - gap - row.h < CONTENT_BOTTOM) {
        newPage()
        placeLabel(si, section.name) // repeat area name on the continuation page
      } else {
        y -= gap
      }
      let x = MARGIN
      for (const pi of row.photoIdxs) {
        const w = aspect(section.photos[pi]!) * row.h
        page.photos.push({ sectionIndex: si, photoIndex: pi, x, y: y - row.h, w, h: row.h })
        x += w + PHOTO_GAP
      }
      y -= row.h
      pageEmpty = false
    })
  })

  if (pages.length > 1 && pages[pages.length - 1]!.labels.length === 0) pages.pop()
  return pages
}
