import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number | null | undefined): string {
  if (amount == null) return 'RM 0.00'
  return `RM ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return s
  }
}

const TYPE_LABELS: Record<string, string> = {
  checkin: 'Check-in',
  checkout: 'Check-out',
  maintenance: 'Maintenance',
}

// Truncate text so it fits within maxWidth pts at given fontSize using Helvetica
function trunc(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

function mimeFromUrl(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  return 'image/jpeg'
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { recordId } = await req.json()
    if (!recordId) return NextResponse.json({ error: 'recordId required' }, { status: 400 })

    // Fetch record with nested unit + services + providers
    const { data: record, error } = await supabase
      .from('records')
      .select('*, unit:units(*), services(*, provider:service_providers(*))')
      .eq('id', recordId)
      .single()

    if (error || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const services = (record.services ?? []) as Array<{
      id: string
      description: string
      amount: number
      invoice_url: string | null
      notes: string | null
      provider: { name: string; bank_name: string; bank_account: string } | null
    }>
    const unit = record.unit as { unit_number: string; building: string } | null

    // ── Build PDF ─────────────────────────────────────────────────────────────

    const pdfDoc = await PDFDocument.create()
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const [PW, PH] = PageSizes.A4   // 595.28 × 841.89 pts
    const M = 50                    // margin
    const CW = PW - M * 2           // content width = 495.28

    // Colours
    const ink       = rgb(0.12, 0.10, 0.06)
    const muted     = rgb(0.47, 0.39, 0.25)
    const faint     = rgb(0.31, 0.24, 0.14)
    const gold      = rgb(0.70, 0.61, 0.39)
    const rowEven   = rgb(0.97, 0.96, 0.93)
    const rowHeader = rgb(0.92, 0.88, 0.78)
    const errorRed  = rgb(0.60, 0.20, 0.20)

    // ── Cover page ─────────────────────────────────────────────────────────────

    const cover = pdfDoc.addPage([PW, PH])

    let y = PH - M

    // Logo
    try {
      const logoBytes = readFileSync(join(process.cwd(), 'public', 'logo.png'))
      const logoImg = await pdfDoc.embedPng(logoBytes)
      const logoW = 120
      const logoH = logoImg.height * (logoW / logoImg.width)
      cover.drawImage(logoImg, { x: M, y: y - logoH, width: logoW, height: logoH })
      y -= logoH + 24
    } catch {
      // If logo can't be embedded, fall through and just draw the divider
      y -= 10
    }

    cover.drawText('Invoice Bundle', { x: M, y, size: 13, font: regular, color: muted })
    y -= 16
    cover.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: gold })

    // Record meta
    const displayDate = record.type === 'checkin'
      ? (record.move_in_date ?? record.date)
      : record.date

    y -= 22
    cover.drawText(`Unit: ${unit?.unit_number ?? ''}`, { x: M, y, size: 11, font: regular, color: ink })
    y -= 17
    cover.drawText(`Tenant: ${record.tenant_name ?? '—'}`, { x: M, y, size: 11, font: regular, color: ink })
    y -= 17
    cover.drawText(`Record Type: ${TYPE_LABELS[record.type] ?? record.type}`, { x: M, y, size: 11, font: regular, color: ink })
    y -= 17
    cover.drawText(`Date: ${fmtDate(displayDate)}`, { x: M, y, size: 11, font: regular, color: ink })

    // Services table heading
    y -= 28
    cover.drawText('Services Invoice & Outstanding Utility Statement', { x: M, y, size: 13, font: bold, color: ink })

    // Table header row
    y -= 20
    cover.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: rowHeader })
    cover.drawText('#',           { x: M + 4,   y, size: 9, font: bold, color: faint })
    cover.drawText('Description', { x: M + 22,  y, size: 9, font: bold, color: faint })
    cover.drawText('Provider',    { x: M + 255, y, size: 9, font: bold, color: faint })
    const amtHdr = 'Amount'
    cover.drawText(amtHdr, {
      x: PW - M - bold.widthOfTextAtSize(amtHdr, 9), y,
      size: 9, font: bold, color: faint,
    })

    // Service rows
    services.forEach((s, i) => {
      y -= 18
      if (i % 2 === 0) {
        cover.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: rowEven })
      }
      cover.drawText(String(i + 1), { x: M + 4, y, size: 9, font: regular, color: ink })
      cover.drawText(trunc(s.description, 43), { x: M + 22, y, size: 9, font: regular, color: ink })
      cover.drawText(trunc(s.provider?.name ?? '—', 24), { x: M + 255, y, size: 9, font: regular, color: ink })
      const amt = fmt(s.amount)
      cover.drawText(amt, {
        x: PW - M - regular.widthOfTextAtSize(amt, 9), y,
        size: 9, font: regular, color: ink,
      })
    })

    // Total row
    y -= 14
    cover.drawLine({ start: { x: M, y: y + 6 }, end: { x: PW - M, y: y + 6 }, thickness: 0.4, color: gold })
    y -= 6
    const total = services.reduce((sum, s) => sum + (s.amount ?? 0), 0)
    cover.drawText('Total', { x: M + 22, y, size: 10, font: bold, color: ink })
    const totalStr = fmt(total)
    cover.drawText(totalStr, {
      x: PW - M - bold.widthOfTextAtSize(totalStr, 10), y,
      size: 10, font: bold, color: ink,
    })

    // ── Invoice pages ──────────────────────────────────────────────────────────

    for (const service of services.filter((s) => s.invoice_url)) {
      const url = service.invoice_url!
      const mime = mimeFromUrl(url)
      const bytes = await fetchBytes(url)

      if (!bytes) {
        // Error page
        const p = pdfDoc.addPage([PW, PH])
        p.drawText(`Could not fetch invoice: ${trunc(service.description, 60)}`, {
          x: M, y: PH / 2, size: 12, font: regular, color: errorRed,
        })
        continue
      }

      if (mime === 'application/pdf') {
        // Merge all pages from the source PDF
        try {
          const src = await PDFDocument.load(bytes)
          const indices = src.getPageIndices()
          const copied = await pdfDoc.copyPages(src, indices)
          copied.forEach((p) => pdfDoc.addPage(p))
        } catch {
          const p = pdfDoc.addPage([PW, PH])
          p.drawText(`Could not parse PDF: ${trunc(service.description, 60)}`, {
            x: M, y: PH / 2, size: 12, font: regular, color: errorRed,
          })
        }
      } else {
        // Image: embed full-page with header label
        try {
          const img = mime === 'image/png'
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes)

          const p = pdfDoc.addPage([PW, PH])

          // Header
          const labelY = PH - M
          p.drawText(trunc(service.description, 62), {
            x: M, y: labelY, size: 11, font: bold, color: ink,
          })
          if (service.provider) {
            p.drawText(`${service.provider.name}  ·  ${fmt(service.amount)}`, {
              x: M, y: labelY - 14, size: 9, font: regular, color: muted,
            })
          }
          p.drawLine({
            start: { x: M, y: labelY - 22 },
            end: { x: PW - M, y: labelY - 22 },
            thickness: 0.3, color: gold,
          })

          // Image area: below header down to bottom margin
          const imgAreaTop  = labelY - 30
          const imgAreaH    = imgAreaTop - M
          const scaled      = img.scaleToFit(CW, imgAreaH)
          const imgX        = M + (CW - scaled.width) / 2
          const imgY        = imgAreaTop - scaled.height

          p.drawImage(img, { x: imgX, y: imgY, width: scaled.width, height: scaled.height })
        } catch {
          const p = pdfDoc.addPage([PW, PH])
          p.drawText(`Could not embed image: ${trunc(service.description, 60)}`, {
            x: M, y: PH / 2, size: 12, font: regular, color: errorRed,
          })
        }
      }
    }

    // ── Return PDF ─────────────────────────────────────────────────────────────

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment',
      },
    })
  } catch (err) {
    console.error('invoice-bundle error:', err)
    return NextResponse.json({ error: 'Failed to generate invoice bundle' }, { status: 500 })
  }
}
