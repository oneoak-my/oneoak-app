// Tenancy agreement template registry.
// To add a template: drop its JSON next to this file (same shape as standard-forfeit-2-months.json),
// import it below and add one entry to TEMPLATES with a render config. Clause wording always comes from the JSON.

import standardForfeit2Months from './standard-forfeit-2-months.json'

export interface TemplateClause {
  no: string
  margin: string[]
  text: string
  sub?: TemplateClause[]
}

export interface ScheduleRowDef {
  no: string
  item: string
  particulars: string
  optional?: boolean
}

export interface TenancyTemplateJson {
  id: string
  name: string
  version: number
  preamble: { margin: string[]; text: string }
  whereas: TemplateClause[]
  agreed_intro: string
  agreed: TemplateClause[]
  testimonium: string
  schedule: { title: string; subtitle: string; columns: string[]; rows: ScheduleRowDef[] }
  schedule_ii: {
    title: string
    subtitle: string
    intro: string
    table_header: string[]
    landlord_items: string[][]
    tenant_items: string[][]
    table_note: string
    termination_intro: string
    termination_items: string[]
  }
}

/** Layout knobs shared by the PDF and Word renderers. */
export interface RenderConfig {
  /** Clause number after which typed additional clauses are appended (7 → 7.9, 7.10, …). */
  extraClausesAfter: string
  /** Body font size in points. */
  bodySize: number
  /** Clause page geometry in points from the left page edge (original template measurements). */
  body: {
    /** Clause numbers (1., 5.1, 7.10 …) */
    numberX: number
    /** Clause and sub-clause text */
    textX: number
    /** Right edge of the justified text */
    textRight: number
    /** Margin headings start here (in the right page margin) … */
    marginX: number
    /** … and wrap at this width */
    marginWidth: number
    /** Line pitch of the body text */
    lineHeight: number
  }
}

export interface TenancyTemplate {
  id: string
  label: string
  json: TenancyTemplateJson
  render: RenderConfig
}

export const TEMPLATES: TenancyTemplate[] = [
  {
    id: 'standard-forfeit-2-months',
    label: 'Standard - Forfeit 2 months deposit',
    json: standardForfeit2Months as TenancyTemplateJson,
    render: {
      extraClausesAfter: '7',
      bodySize: 10,
      body: { numberX: 78.1, textX: 114.1, textRight: 448.3, marginX: 512.4, marginWidth: 66, lineHeight: 12.1 },
    },
  },
]

export const DEFAULT_TEMPLATE_ID = TEMPLATES[0].id

export function getTemplate(id: string | null | undefined): TenancyTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}
