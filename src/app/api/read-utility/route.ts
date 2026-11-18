import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/apiAuth'
import {
  MAX_UTILITY_FILES,
  MAX_UTILITY_FILE_BYTES,
  docUnit,
  normalizeDoc,
  unitsMatch,
  type UtilityReadResult,
} from '@/lib/utilityDocs'

// Each file is one model call; allow time for a few in parallel.
export const maxDuration = 60

const PARALLEL = 3
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

// The model only classifies and copies numbers off the page. All arithmetic is done in code.
const PROMPT = `You are reading ONE file about a Malaysian condominium unit's utilities. Classify it and copy values exactly as printed. Do NOT calculate, total, net off or infer anything.

Return ONLY a JSON object, no other text: {"type": "<type>", "data": {...}}

Types and their data:

1. "water_statement": the management office's statement of account listing water invoices (Ooak Residence / Ooak Suites).
   {"unitNo": string|null, "statementDate": "YYYY-MM-DD"|null,
    "rows": [{"invoiceNo": string, "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", "amount": number, "paid": number, "outstanding": number}]}
   Include EVERY invoice row, paid or not, in printed order. If a row shows only a billing month, use the first and last day of that month.

2. "water_invoice": a single water bill/invoice.
   {"unitNo": string|null, "invoiceNo": string|null, "periodStart": "YYYY-MM-DD"|null, "periodEnd": "YYYY-MM-DD"|null, "total": number|null, "previousReading": number|null, "currentReading": number|null}

3. "water_meter_photo": a photo of a water meter.
   {"reading": integer|null, "confidence": "high"|"low", "dateStamp": "YYYY-MM-DD"|null}
   reading = the whole cubic metres shown on the WHITE/BLACK number drums only. IGNORE the red drums (fractions of a cubic metre). Use "low" confidence if any drum is blurred, between digits, glared or partly hidden. dateStamp only if a date is printed/stamped on the photo.

4. "ynh_invoice": an electricity bill from YNH Utility.
   {"unitNo": string|null, "periodStart": "YYYY-MM-DD"|null, "periodEnd": "YYYY-MM-DD"|null,
    "previousReading": number|null, "currentReading": number|null,
    "rates": {"energy": number|null, "capacity": number|null, "network": number|null, "eei": number|null, "afa": number|null},
    "retailCharge": number|null, "rePct": number|null,
    "outstandingBF": number|null, "currentCharges": number|null, "payable": number|null}
   rates are the RM per kWh rates printed for Energy, Capacity, Network, EEI (Energy Efficiency Incentive, a NEGATIVE rate) and AFA. retailCharge is the full retail charge in RM. rePct is the RE (KWTBB) percentage as a fraction (1.60% -> 0.016). outstandingBF = balance brought forward, currentCharges = this month's charges, payable = total amount payable. IGNORE the "Deposit" box entirely: it is not the tenant's deposit.

5. "ynh_statement": a YNH Utility statement of account / ledger.
   {"unitNo": string|null, "statementDate": "YYYY-MM-DD"|null,
    "rows": [{"periodStart": "YYYY-MM-DD"|null, "periodEnd": "YYYY-MM-DD"|null, "outstanding": number}],
    "total": number|null}
   One row per line. Parse the billing period from the particulars text (e.g. "Bill for 01/06/2026 - 30/06/2026"). Receipts, payments and credits are NEGATIVE numbers and keep the period of the month they were paid for, or null if none is stated.

6. "unknown": anything else. {"type": "unknown", "data": {}}

General rules: unitNo is the unit number only (e.g. "A-27-09"), without the building name. Amounts are plain numbers without "RM" or commas. Dates are YYYY-MM-DD. Use null for anything not shown.`

type InFile = { name?: unknown; mimeType?: unknown; base64?: unknown }

async function readOne(client: Anthropic, f: InFile, expectedUnit: string | null): Promise<UtilityReadResult> {
  const name = typeof f.name === 'string' ? f.name : 'file'
  const mimeType = typeof f.mimeType === 'string' ? f.mimeType : ''
  const base64 = typeof f.base64 === 'string' ? f.base64 : ''
  if (!base64) return { error: `${name}: empty file` }
  if (Math.floor((base64.length * 3) / 4) > MAX_UTILITY_FILE_BYTES) return { error: `${name}: larger than 10 MB` }

  const isImage = (IMAGE_TYPES as readonly string[]).includes(mimeType)
  if (!isImage && mimeType !== 'application/pdf') return { error: `${name}: only PDF and image files are supported` }

  const contentBlock = isImage
    ? ({ type: 'image' as const, source: { type: 'base64' as const, media_type: mimeType as ImageType, data: base64 } })
    : ({ type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
    })
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const bareMatch = text.match(/(\{[\s\S]*\})/)
    const jsonStr = fenceMatch?.[1] ?? bareMatch?.[1] ?? null
    if (!jsonStr) return { error: `${name}: could not read the document` }

    let parsed: { type?: unknown; data?: unknown }
    try {
      parsed = JSON.parse(jsonStr.trim())
    } catch {
      return { error: `${name}: could not read the document` }
    }

    const doc = normalizeDoc(parsed.type, parsed.data)
    const unit = docUnit(doc)
    if (expectedUnit && unit && !unitsMatch(unit, expectedUnit)) {
      return { ...doc, warning: `Unit ${unit} does not match ${expectedUnit}: not used in calculations` }
    }
    return doc
  } catch (err) {
    console.error('read-utility error:', err)
    return { error: `${name}: ${err instanceof Error ? err.message : 'reading failed'}` }
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) return auth

  let body: { files?: unknown; unitNo?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const files = Array.isArray(body.files) ? (body.files as InFile[]) : []
  if (files.length === 0) return NextResponse.json({ error: 'files required' }, { status: 400 })
  if (files.length > MAX_UTILITY_FILES) {
    return NextResponse.json({ error: `At most ${MAX_UTILITY_FILES} files` }, { status: 400 })
  }
  const expectedUnit = typeof body.unitNo === 'string' && body.unitNo.trim() ? body.unitNo.trim() : null

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // One call per file, at most PARALLEL at a time; results keep the input order.
  const results: UtilityReadResult[] = new Array(files.length)
  let next = 0
  async function worker() {
    while (next < files.length) {
      const i = next++
      results[i] = await readOne(client, files[i], expectedUnit)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker))

  return NextResponse.json({ results })
}
