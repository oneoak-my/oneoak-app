// Free, in-browser OCR (tesseract.js, English). Nothing is uploaded: the OCR engine and
// English language data are downloaded once from public CDNs and cached by the browser;
// the images themselves never leave the device.

export type OcrSource = HTMLCanvasElement | Blob

/**
 * Reads text from one or more images/pages, in order. `onProgress` gets 0..1 across all sources.
 * Loaded with a dynamic import so pages that never OCR do not download tesseract.js.
 */
export async function ocrText(sources: OcrSource[], onProgress?: (p: number) => void): Promise<string> {
  if (!sources.length) return ''
  const { createWorker } = await import('tesseract.js')
  let current = 0
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.((current + m.progress) / sources.length)
    },
  })
  try {
    const out: string[] = []
    for (current = 0; current < sources.length; current++) {
      const { data } = await worker.recognize(sources[current])
      out.push(data.text)
    }
    onProgress?.(1)
    return out.join('\n')
  } finally {
    await worker.terminate()
  }
}
