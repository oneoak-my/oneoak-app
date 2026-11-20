// Image preparation for OCR, in the browser: EXIF rotation, downscale to ~2200px, greyscale + contrast stretch.
// Nothing leaves the device.

const MAX_EDGE = 2200

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close?: () => void }> {
  try {
    // 'from-image' applies the EXIF orientation (phone photos taken sideways).
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode() // modern browsers also apply EXIF orientation to <img>
      return { src: img, w: img.naturalWidth, h: img.naturalHeight }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }
}

/** Greyscale, then stretch the 2nd–98th percentile of brightness to full range. */
export function enhanceCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    px[i] = px[i + 1] = px[i + 2] = g
    hist[g]++
  }
  const total = px.length / 4
  let lo = 0, hi = 255, acc = 0
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > total * 0.02) break }
  acc = 0
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > total * 0.02) break }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

export async function prepareImageForOcr(file: Blob): Promise<HTMLCanvasElement> {
  const { src, w, h, close } = await decode(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  close?.()
  return enhanceCanvas(canvas)
}
