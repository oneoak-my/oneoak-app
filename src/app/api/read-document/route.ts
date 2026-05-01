import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: Request) {
  try {
    const { base64, mimeType } = await request.json()
    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'base64 and mimeType required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const isImage = mimeType.startsWith('image/')

    const contentBlock = isImage
      ? ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        })
      : ({
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: 'Extract the following from this tenancy agreement: landlord name, tenant name, unit address, monthly rental amount, tenancy start date, tenancy end date, security deposit amount. Return as JSON only, with keys: landlord_name, tenant_name, unit_address, monthly_rental (number), tenancy_start_date (YYYY-MM-DD), tenancy_end_date (YYYY-MM-DD), security_deposit (number). If a field is not found, use null.',
            },
          ],
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not extract JSON from response' }, { status: 422 })
    }

    const extracted = JSON.parse(jsonMatch[0])
    return NextResponse.json(extracted)
  } catch (err) {
    console.error('read-document error:', err)
    return NextResponse.json({ error: 'Failed to read document' }, { status: 500 })
  }
}
