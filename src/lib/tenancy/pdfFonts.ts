// Font files for the tenancy agreement PDF (served from /public/fonts, embedded with pdf-lib + fontkit).
// Verdana: body text. Calibri: cover page. Arial roles (margin headings, initial boxes, page numbers) use the
// PDF standard Helvetica, which has the same character widths as Arial.

export interface AgreementFontBytes {
  verdana: ArrayBuffer | Uint8Array
  verdanaBold: ArrayBuffer | Uint8Array
  calibri: ArrayBuffer | Uint8Array
  calibriBold: ArrayBuffer | Uint8Array
}

export const AGREEMENT_FONT_FILES: Record<keyof AgreementFontBytes, string> = {
  verdana: 'Verdana.ttf',
  verdanaBold: 'Verdana Bold.ttf',
  calibri: 'Calibri.ttf',
  calibriBold: 'Calibrib.ttf',
}

let cache: Promise<AgreementFontBytes> | null = null

/** Downloads the four font files once per visit (browser only). */
export function loadAgreementFonts(): Promise<AgreementFontBytes> {
  if (!cache) {
    const entries = Object.entries(AGREEMENT_FONT_FILES) as [keyof AgreementFontBytes, string][]
    cache = Promise.all(entries.map(async ([key, file]) => {
      const res = await fetch(`/fonts/${encodeURIComponent(file)}`)
      if (!res.ok) throw new Error(`Font ${file} could not be loaded (${res.status})`)
      return [key, await res.arrayBuffer()] as const
    }))
      .then((pairs) => Object.fromEntries(pairs) as unknown as AgreementFontBytes)
      .catch((e) => { cache = null; throw e })
  }
  return cache
}
