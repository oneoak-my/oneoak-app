import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'

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

// ── Route — GET /api/invoice-bundle?recordId=... ──────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const recordId = searchParams.get('recordId')
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

    const ink       = rgb(0.12, 0.10, 0.06)
    const muted     = rgb(0.47, 0.39, 0.25)
    const faint     = rgb(0.31, 0.24, 0.14)
    const gold      = rgb(0.70, 0.61, 0.39)
    const rowEven   = rgb(0.97, 0.96, 0.93)
    const rowHeader = rgb(0.92, 0.88, 0.78)
    const errorRed  = rgb(0.60, 0.20, 0.20)

    // ── Cover page ────────────────────────────────────────────────────────────

    const cover = pdfDoc.addPage([PW, PH])
    let y = PH - M

    // Logo — fetch from public URL so it works in serverless
    try {
      const logoBytes = await fetchBytes(new URL('/logo.png', request.url).toString())
      if (logoBytes) {
        const logoImg = await pdfDoc.embedPng(logoBytes)
        // Cap at 160pt wide, 70pt tall — scaleToFit maintains aspect ratio
        const scaled = logoImg.scaleToFit(160, 70)
        cover.drawImage(logoImg, { x: M, y: y - scaled.height, width: scaled.width, height: scaled.height })
        y -= scaled.height + 16
      } else {
        y -= 10
      }
    } catch {
      y -= 10
    }

    cover.drawText('Invoice Bundle', { x: M, y, size: 13, font: regular, color: muted })
    y -= 16
    cover.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: gold })

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

    y -= 28
    cover.drawText('Services Invoice & Outstanding Utility Statement', { x: M, y, size: 13, font: bold, color: ink })

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

    // ── Invoice pages ─────────────────────────────────────────────────────────

    for (const service of services.filter((s) => s.invoice_url)) {
      const url = service.invoice_url!
      const mime = mimeFromUrl(url)
      const bytes = await fetchBytes(url)

      if (!bytes) {
        const p = pdfDoc.addPage([PW, PH])
        p.drawText(`Could not fetch invoice: ${trunc(service.description, 60)}`, {
          x: M, y: PH / 2, size: 12, font: regular, color: errorRed,
        })
        continue
      }

      if (mime === 'application/pdf') {
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
        try {
          const img = mime === 'image/png'
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes)

          const p = pdfDoc.addPage([PW, PH])
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

          const imgAreaTop = labelY - 30
          const imgAreaH   = imgAreaTop - M
          const scaled     = img.scaleToFit(CW, imgAreaH)
          const imgX       = M + (CW - scaled.width) / 2
          const imgY       = imgAreaTop - scaled.height

          p.drawImage(img, { x: imgX, y: imgY, width: scaled.width, height: scaled.height })
        } catch {
          const p = pdfDoc.addPage([PW, PH])
          p.drawText(`Could not embed image: ${trunc(service.description, 60)}`, {
            x: M, y: PH / 2, size: 12, font: regular, color: errorRed,
          })
        }
      }
    }

    // ── Return PDF ────────────────────────────────────────────────────────────

    const pdfBytes = await pdfDoc.save()
    const unitStr = (unit?.unit_number ?? 'unit').replace(/[^a-zA-Z0-9]/g, '-')
    const filename = `${unitStr}-${record.type}-invoices.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('invoice-bundle error:', err)
    return NextResponse.json({ error: 'Failed to generate invoice bundle' }, { status: 500 })
  }
}
