import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: Request) {
  try {
    const { base64, mimeType, prompt: customPrompt } = await request.json()
    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'base64 and mimeType required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const isImage = mimeType.startsWith('image/')

    const contentBlock = isImage
      ? ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64,
          },
        })
      : ({
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64,
          },
        })

    const defaultPrompt = `Extract the following from this tenancy agreement document. Return ONLY a JSON object with no other text:
{
  "landlord_name": "string or null",
  "landlord_id": "string (NRIC/passport/company no) or null",
  "tenant_name": "string or null",
  "tenant_id": "string (NRIC/passport/company no) or null",
  "unit_full_address": "string or null",
  "original_ta_date": "YYYY-MM-DD or null",
  "monthly_rental": "number or null",
  "security_deposit": "number or null",
  "utility_deposit": "number or null",
  "tenancy_start_date": "YYYY-MM-DD or null",
  "tenancy_end_date": "YYYY-MM-DD or null"
}
If any field is not found, use null.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: customPrompt ?? defaultPrompt },
          ],
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Handle JSON in code fences or bare JSON object
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const bareMatch = text.match(/(\{[\s\S]*\})/)
    const jsonStr = fenceMatch?.[1] ?? bareMatch?.[1] ?? null

    if (!jsonStr) {
      return NextResponse.json(
        { error: 'Model did not return valid JSON', raw: text.slice(0, 300) },
        { status: 422 },
      )
    }

    let extracted: unknown
    try {
      extracted = JSON.parse(jsonStr.trim())
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse JSON from model response', raw: jsonStr.slice(0, 300) },
        { status: 422 },
      )
    }

    return NextResponse.json(extracted)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('read-document error:', err)
    return NextResponse.json(
      { error: `Failed to read document: ${message}` },
      { status: 500 },
    )
  }
}
