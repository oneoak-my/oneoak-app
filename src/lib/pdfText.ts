// Free, in-browser PDF text extraction (pdfjs-dist). No server, no AI.
// Text items are grouped into lines by their y position and kept in column (x) order.

export type PdfTextItem = { str: string; x: number; y: number; width: number; height: number }

/** Groups positioned text items into lines (top to bottom), each line in left-to-right order. */
export function groupItemsIntoLines(items: PdfTextItem[]): string[] {
  const words = items.filter((i) => i.str.trim() !== '')
  words.sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: { y: number; tol: number; items: PdfTextItem[] }[] = []
  for (const w of words) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row.y - w.y) <= row.tol) row.items.push(w)
    else rows.push({ y: w.y, tol: Math.max(2, (w.height || 10) * 0.4), items: [w] })
  }

  return rows.map((row) => {
    row.items.sort((a, b) => a.x - b.x)
    let line = ''
    let prevEnd = -Infinity
    for (const it of row.items) {
      const gap = it.x - prevEnd
      const text = it.str.trim()
      line += line && gap > Math.max(1, (it.height || 10) * 0.15) ? ` ${text}` : text
      prevEnd = it.x + it.width
    }
    return line.replace(/\s+/g, ' ').trim()
  })
}

/** Extracts the text of every page as lines. Returns [] for scanned (image-only) PDFs. */
export async function extractPdfLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString()
  }
  // isEvalSupported: false closes the font-eval hole in pdf.js 3.x (CVE-2024-4367).
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  try {
    const lines: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const it of content.items) {
        if (!('str' in it)) continue
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height })
      }
      lines.push(...groupItemsIntoLines(items))
      page.cleanup()
    }
    return lines
  } finally {
    await doc.destroy()
  }
}
