export const MAX_EDGE = 1600
export const JPEG_QUALITY = 0.75

export interface CompressedImage { blob: Blob; width: number; height: number }

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Respects EXIF orientation, so phone photos come out the right way up.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Fallback for browsers that reject the options bag; <img> also applies EXIF orientation.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

// One decode at a time: full-size phone photos are ~50 MB as bitmaps.
let chain: Promise<unknown> = Promise.resolve()

export function compressImage(file: File): Promise<CompressedImage> {
  const run = chain.then(() => compressNow(file))
  chain = run.catch(() => undefined)
  return run
}

async function compressNow(file: File): Promise<CompressedImage> {
  const src = await decode(file)
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  if (!sw || !sh) throw new Error('Could not read image')
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.fillStyle = '#fff' // flatten any transparency (PNG screenshots)
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, width, height)
  if ('close' in src) src.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  canvas.width = 0
  canvas.height = 0
  if (!blob) throw new Error('JPEG export failed')
  return { blob, width, height }
}
