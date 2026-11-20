'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FileDown, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { saveAgreement, type UnitLite } from '@/lib/tenancy/api'
import { TEMPLATES, getTemplate } from '@/lib/tenancy/templates'
import {
  emptyLandlord, emptyTenant, isForeignTenant, newId, normaliseTenancyData,
  type IdType, type Landlord, type PersonId, type TenancyAgreementRow, type TenancyData, type Tenant,
} from '@/lib/tenancy/types'
import { buildAgreementModel, depositMonths, dueDayNumber, BLANK } from '@/lib/tenancy/model'
import { applyDateTermChange } from '@/lib/tenancy/sync'
import { depositMonthsLabel, ordinal, parseAmount, ringgitWords } from '@/lib/tenancy/helpers'
import DocDropZone from './DocDropZone'

// ── Small form pieces ────────────────────────────────────────────────────────

const BASE_INPUT =
  'w-full rounded-xl border bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors'

function inputCls(highlight: boolean) {
  return cn(BASE_INPUT, highlight ? 'border-orange-500/30 bg-orange-500/20' : 'border-[#332c20]')
}

function Label({ text, required, empty, source }: { text: string; required?: boolean; empty?: boolean; source?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#a89d84]">
      {text}
      {required && empty && <span className="text-[10px] font-semibold text-orange-300">Required</span>}
      {source && (
        <span title={`Read from ${source}`} className="max-w-[180px] truncate rounded-md border border-blue-500/30 bg-blue-500/20 px-1.5 py-px text-[10px] font-normal text-blue-300">
          Read from {source}
        </span>
      )}
    </span>
  )
}

function Field({
  label, value, onChange, required, type = 'text', placeholder, multiline, inputMode, source,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: 'text' | 'date'
  placeholder?: string
  multiline?: boolean
  inputMode?: 'decimal' | 'numeric'
  source?: string
}) {
  const empty = !value.trim()
  const cls = inputCls(!!required && empty)
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <Label text={label} required={required} empty={empty} source={source} />
      {multiline ? (
        <textarea rows={3} className={cn(cls, 'resize-y')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} inputMode={inputMode} className={cls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

function SelectField<T extends string>({
  label, value, options, onChange, required, source,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; required?: boolean; source?: string }) {
  const empty = !value
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <Label text={label} required={required} empty={empty} source={source} />
      <select className={cn(inputCls(!!required && empty), 'appearance-none cursor-pointer')} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1e1a14] text-[#f5f0e8]">{o.label}</option>
        ))}
      </select>
    </label>
  )
}

const ID_TYPES: { value: IdType; label: string }[] = [
  { value: 'NRIC', label: 'NRIC' },
  { value: 'Passport', label: 'Passport' },
]

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#332c20] bg-[#1e1a14] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#f5f0e8]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function SubCard({ title, onRemove, children }: { title: string; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#332c20] bg-[#141210] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#a89d84]">{title}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-[#7c6f54] hover:text-red-400 px-1.5 py-1 rounded-lg hover:bg-red-500/10">
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Hint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <p className={cn('text-xs', warn ? 'text-orange-300' : 'text-[#7c6f54]')}>{children}</p>
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs text-gold-400 hover:underline">
      {children}
    </button>
  )
}

function PersonFields({
  person, onChange, nameLabel, required, src,
}: { person: PersonId; onChange: (p: PersonId) => void; nameLabel: string; required?: boolean; src?: (field: 'name' | 'idNo') => string | undefined }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.5fr] gap-3">
      <Field label={nameLabel} value={person.name} onChange={(name) => onChange({ ...person, name })} required={required} source={src?.('name')} />
      <SelectField label="ID type" value={person.idType} options={ID_TYPES} onChange={(idType) => onChange({ ...person, idType })} />
      <Field label="ID no." value={person.idNo} onChange={(idNo) => onChange({ ...person, idNo })} required={required} source={src?.('idNo')} />
    </div>
  )
}

// ── Required fields (highlighted only; never block downloads) ────────────────

function missingCount(d: TenancyData): number {
  const vals: string[] = [
    d.agreementDate, d.premises, d.commencing, d.terminating, d.term, d.monthlyRent,
    d.bankName, d.accountNo, d.accountHolder, d.securityDeposit, d.utilityDeposit,
    d.landlordWitness.name, d.landlordWitness.idNo, d.tenantWitness.name, d.tenantWitness.idNo,
  ]
  for (const l of d.landlords) vals.push(l.name, l.idNo)
  for (const t of d.tenants) {
    if (t.kind === 'company') vals.push(t.companyName, t.companyNo)
    else {
      vals.push(t.name, t.idNo)
      if (isForeignTenant(t)) vals.push(t.nationality, t.dob, t.gender)
    }
  }
  return vals.filter((v) => !v.trim()).length
}

// ── Download helper ──────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Editor ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export default function AgreementEditor({ row, units }: { row: TenancyAgreementRow; units: UnitLite[] }) {
  const [title, setTitle] = useState(row.title ?? '')
  const [unitId, setUnitId] = useState(row.unit_id ?? '')
  const [templateId, setTemplateId] = useState(getTemplate(row.template_id).id)
  const [data, setData] = useState<TenancyData>(() => normaliseTenancyData(row.data))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'word' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  // "Read from <file>" tags (this visit only; files themselves are never kept).
  const [sources, setSources] = useState<Record<string, string>>({})
  const src = (path: string) => sources[path]

  // ── Autosave (debounced; flushes when leaving the page) ──
  const latest = useRef({ title, unitId, templateId, data })
  latest.current = { title, unitId, templateId, data }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const first = useRef(true)

  const flush = useRef(async () => {
    timer.current = null
    const v = latest.current
    setSaveState('saving')
    try {
      await saveAgreement(row.id, { title: v.title.trim() || 'Untitled draft', unit_id: v.unitId || null, template_id: v.templateId, data: v.data })
      setSaveState('saved')
      setSaveError(null)
    } catch (e) {
      setSaveState('error')
      setSaveError((e as Error)?.message ?? String(e))
    }
  })

  useEffect(() => {
    if (first.current) { first.current = false; return }
    setSaveState('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { flush.current() }, 800)
  }, [title, unitId, templateId, data])

  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); flush.current() }
  }, [])

  // ── Updaters ──
  const set = <K extends keyof TenancyData>(key: K, value: TenancyData[K]) => setData((d) => ({ ...d, [key]: value }))
  const setLandlord = (i: number, l: Landlord) => setData((d) => ({ ...d, landlords: d.landlords.map((x, j) => (j === i ? l : x)) }))
  const setTenant = (i: number, t: Tenant) => setData((d) => ({ ...d, tenants: d.tenants.map((x, j) => (j === i ? t : x)) }))

  function linkUnit(id: string) {
    setUnitId(id)
    const u = units.find((x) => x.id === id)
    if (!u) return
    const text = `${u.unit_number}, ${u.building}`
    if (data.premises.trim() && data.premises.trim() !== text && !confirm(`Replace the premises text with "${text}"?`)) return
    set('premises', text)
    if (!title.trim() || title.trim() === 'Untitled draft') setTitle(`${u.unit_number} ${u.building}`)
  }

  function moveClause(i: number, dir: -1 | 1) {
    setData((d) => {
      const list = [...d.extraClauses]
      const j = i + dir
      if (j < 0 || j >= list.length) return d
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...d, extraClauses: list }
    })
  }

  // ── Derived values ──
  const template = getTemplate(templateId)
  const rent = parseAmount(data.monthlyRent)
  const security = parseAmount(data.securityDeposit)
  const utility = parseAmount(data.utilityDeposit)
  const dueDay = dueDayNumber(data)
  const missing = useMemo(() => missingCount(data), [data])
  const lastFixedSub = useMemo(() => {
    const anchor = template.json.agreed.find((c) => c.no === template.render.extraClausesAfter)
    return anchor?.sub?.length ?? 0
  }, [template])

  async function download(kind: 'pdf' | 'word') {
    setBusy(kind)
    setDownloadError(null)
    try {
      const model = buildAgreementModel(template, data)
      if (kind === 'pdf') {
        const [{ buildAgreementPdf }, { loadAgreementFonts }] = await Promise.all([import('@/lib/tenancy/pdf'), import('@/lib/tenancy/pdfFonts')])
        const bytes = await buildAgreementPdf(model, template.render, await loadAgreementFonts())
        downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), `${model.fileStem}.pdf`)
      } else {
        const [{ buildAgreementDocx }, { Packer }] = await Promise.all([import('@/lib/tenancy/docx'), import('docx')])
        const doc = await buildAgreementDocx(model, template.render)
        downloadBlob(await Packer.toBlob(doc), `${model.fileStem}.docx`)
      }
    } catch (e) {
      setDownloadError(`Could not build the ${kind === 'pdf' ? 'PDF' : 'Word file'}: ${(e as Error)?.message ?? e}`)
    } finally {
      setBusy(null)
    }
  }

  const saveLabel: Record<SaveState, string> = {
    idle: 'All changes saved', pending: 'Unsaved changes…', saving: 'Saving…', saved: 'All changes saved', error: 'Not saved',
  }

  const monthsRow = (
    label: string, override: string | null, deposit: string, setOverride: (v: string | null) => void,
  ) => {
    const auto = depositMonthsLabel(parseAmount(deposit), rent)
    return (
      <div className="space-y-1">
        <Field label={label} value={override ?? auto ?? ''} placeholder="e.g. 2 months" onChange={(v) => setOverride(v)} />
        <div className="flex items-center gap-2">
          <Hint>Prints as “({depositMonths(override, deposit, data.monthlyRent)} rental)”.</Hint>
          {override != null && <LinkButton onClick={() => setOverride(null)}>Auto</LinkButton>}
        </div>
      </div>
    )
  }

  const words = (n: number | null) => <Hint>{n == null ? `Ringgit Malaysia ${BLANK} Only` : ringgitWords(n)}</Hint>

  return (
    <div className="px-4 pt-4 pb-8 space-y-4 max-w-2xl mx-auto">
      {/* Draft header */}
      <Section
        title="Draft"
        aside={<span className={cn('text-xs', saveState === 'error' ? 'text-orange-300' : 'text-[#7c6f54]')}>{saveLabel[saveState]}</span>}
      >
        {saveState === 'error' && (
          <Hint warn>Could not save: {saveError}. Your typing is kept on this page; it will retry on the next change.</Hint>
        )}
        <SelectField label="Template" value={templateId} options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} onChange={setTemplateId} />
        <Field label="Draft title" value={title} onChange={setTitle} placeholder="e.g. A-27-09 Ooak Residence" />
        <SelectField
          label="Link to unit (optional)"
          value={unitId}
          options={[{ value: '', label: 'Not linked' }, ...units.map((u) => ({ value: u.id, label: `${u.unit_number} — ${u.building}` }))]}
          onChange={linkUnit}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" size="sm" icon={<FileDown size={14} />} loading={busy === 'pdf'} disabled={busy !== null} onClick={() => download('pdf')}>
            Download PDF
          </Button>
          <Button variant="outline" size="sm" icon={<FileDown size={14} />} loading={busy === 'word'} disabled={busy !== null} onClick={() => download('word')}>
            Download Word (.docx)
          </Button>
        </div>
        {missing > 0 && <Hint warn>{missing} required field{missing === 1 ? '' : 's'} empty. They print as “{BLANK}”.</Hint>}
        {downloadError && <Hint warn>{downloadError}</Hint>}
      </Section>

      <Section title="Upload documents">
        <DocDropZone
          data={data}
          getData={() => latest.current.data}
          onApply={(next, srcs) => {
            latest.current = { ...latest.current, data: next }
            setData(next)
            setSources((s) => ({ ...s, ...srcs }))
          }}
        />
      </Section>

      <Section title="Agreement">
        <Field label="Date of Agreement" type="date" value={data.agreementDate} onChange={(v) => set('agreementDate', v)} required source={src('agreementDate')} />
      </Section>

      {/* Landlords */}
      <Section
        title="Landlords"
        aside={<LinkButton onClick={() => set('landlords', [...data.landlords, emptyLandlord()])}>+ Add landlord</LinkButton>}
      >
        {data.landlords.map((l, i) => (
          <SubCard
            key={i}
            title={`Landlord ${i + 1}`}
            onRemove={data.landlords.length > 1 ? () => set('landlords', data.landlords.filter((_, j) => j !== i)) : undefined}
          >
            <PersonFields person={l} nameLabel="Name" required src={(f) => src(`landlords.${i}.${f}`)} onChange={(p) => setLandlord(i, { ...l, ...p })} />
            <Field label="Address (optional)" multiline value={l.address} source={src(`landlords.${i}.address`)} onChange={(address) => setLandlord(i, { ...l, address })} />
          </SubCard>
        ))}
      </Section>

      {/* Tenants */}
      <Section
        title="Tenants"
        aside={<LinkButton onClick={() => set('tenants', [...data.tenants, emptyTenant()])}>+ Add tenant</LinkButton>}
      >
        {data.tenants.map((t, i) => (
          <SubCard
            key={i}
            title={`Tenant ${i + 1}`}
            onRemove={data.tenants.length > 1 ? () => set('tenants', data.tenants.filter((_, j) => j !== i)) : undefined}
          >
            <SelectField
              label="Type"
              value={t.kind}
              options={[{ value: 'individual', label: 'Individual' }, { value: 'company', label: 'Company' }]}
              onChange={(kind) => setTenant(i, { ...t, kind })}
            />
            {t.kind === 'individual' ? (
              <>
                <PersonFields person={t} nameLabel="Name" required src={(f) => src(`tenants.${i}.${f}`)} onChange={(p) => setTenant(i, { ...t, ...p })} />
                <Field
                  label="Nationality"
                  value={t.nationality}
                  placeholder="Malaysian"
                  required={isForeignTenant(t)}
                  source={src(`tenants.${i}.nationality`)}
                  onChange={(nationality) => setTenant(i, { ...t, nationality })}
                />
                {isForeignTenant(t) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Date of Birth" type="date" value={t.dob} required source={src(`tenants.${i}.dob`)} onChange={(dob) => setTenant(i, { ...t, dob })} />
                    <SelectField
                      label="Gender"
                      value={t.gender}
                      required
                      source={src(`tenants.${i}.gender`)}
                      options={[{ value: '', label: 'Select…' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]}
                      onChange={(gender) => setTenant(i, { ...t, gender })}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                  <Field label="Company name" value={t.companyName} required source={src(`tenants.${i}.companyName`)} onChange={(companyName) => setTenant(i, { ...t, companyName })} />
                  <Field label="Company registration no." value={t.companyNo} required onChange={(companyNo) => setTenant(i, { ...t, companyNo })} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label text="Occupants" />
                    <LinkButton onClick={() => setTenant(i, { ...t, occupants: [...t.occupants, { name: '', idNo: '' }] })}>+ Add occupant</LinkButton>
                  </div>
                  {t.occupants.length === 0 && <Hint>No occupants yet. The schedule prints “Occupant(s) : {BLANK}”.</Hint>}
                  {t.occupants.map((o, k) => (
                    <div key={k} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <Field label={`Occupant ${k + 1}`} value={o.name} onChange={(name) => setTenant(i, { ...t, occupants: t.occupants.map((x, j) => (j === k ? { ...x, name } : x)) })} />
                      <Field label="Passport / NRIC (optional)" value={o.idNo} onChange={(idNo) => setTenant(i, { ...t, occupants: t.occupants.map((x, j) => (j === k ? { ...x, idNo } : x)) })} />
                      <button
                        type="button"
                        aria-label="Remove occupant"
                        onClick={() => setTenant(i, { ...t, occupants: t.occupants.filter((_, j) => j !== k) })}
                        className="mb-1 p-2 rounded-lg text-[#7c6f54] hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label text="Authorised signatory (optional, printed in the signing block)" />
                  <PersonFields person={t.signatory} nameLabel="Name" src={(f) => src(`tenants.${i}.signatory.${f}`)} onChange={(signatory) => setTenant(i, { ...t, signatory })} />
                </div>
              </>
            )}
          </SubCard>
        ))}
      </Section>

      {/* Premises & term */}
      <Section title="Premises and term">
        <Field label="Premises address" multiline required source={src('premises')} value={data.premises} onChange={(v) => set('premises', v)} placeholder={'e.g. A-27-09 Ooak Residence\nJalan Kiara 5, 50480 Mont Kiara, Kuala Lumpur'} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Commencing date" type="date" required source={src('commencing')} value={data.commencing} onChange={(value) => setData((d) => applyDateTermChange(d, { field: 'commencing', value }))} />
          <Field label="Terminating date" type="date" required source={src('terminating')} value={data.terminating} onChange={(value) => setData((d) => applyDateTermChange(d, { field: 'terminating', value }))} />
        </div>
        <Field label="Term" required source={src('term')} value={data.term} placeholder="e.g. 1 ( One ) years or 1 year 3 months" onChange={(value) => setData((d) => applyDateTermChange(d, { field: 'term', value }))} />
        <Hint>Calculated from the dates. Type a term with a commencing date and the terminating date is worked out (start + term − 1 day).</Hint>
      </Section>

      {/* Rental */}
      <Section title="Rental">
        <Field label="Monthly rental (RM)" inputMode="decimal" required source={src('monthlyRent')} value={data.monthlyRent} onChange={(v) => set('monthlyRent', v)} placeholder="3500" />
        {words(rent)}
        <Field
          label="Due on (day of month)"
          inputMode="numeric"
          value={data.dueDay}
          placeholder={dueDay ? String(dueDay) : 'Same day as commencing'}
          onChange={(v) => set('dueDay', v.replace(/[^\d]/g, '').slice(0, 2))}
        />
        <Hint>Prints as “Due and payable on the {dueDay ? ordinal(dueDay) : BLANK} day of the each month.”</Hint>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Bank name" required source={src('bankName')} value={data.bankName} onChange={(v) => set('bankName', v)} />
          <Field label="Account no." required source={src('accountNo')} value={data.accountNo} onChange={(v) => set('accountNo', v)} />
          <Field label="Account holder" required source={src('accountHolder')} value={data.accountHolder} onChange={(v) => set('accountHolder', v)} />
        </div>
      </Section>

      {/* Deposits */}
      <Section title="Deposits">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Field label="Security deposit (RM)" inputMode="decimal" required source={src('securityDeposit')} value={data.securityDeposit} onChange={(v) => set('securityDeposit', v)} />
            {words(security)}
          </div>
          {monthsRow('Security deposit months', data.securityMonths, data.securityDeposit, (v) => set('securityMonths', v))}
          <div className="space-y-1">
            <Field label="Utility deposit (RM)" inputMode="decimal" required source={src('utilityDeposit')} value={data.utilityDeposit} onChange={(v) => set('utilityDeposit', v)} />
            {words(utility)}
          </div>
          {monthsRow('Utility deposit months', data.utilityMonths, data.utilityDeposit, (v) => set('utilityMonths', v))}
        </div>
      </Section>

      {/* Other terms */}
      <Section title="Other terms">
        <Field label="Option to renew" source={src('optionToRenew')} value={data.optionToRenew} onChange={(v) => set('optionToRenew', v)} />
        <Field label="Use of the premises" value={data.useOfPremises} onChange={(v) => set('useOfPremises', v)} />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
          <Field label="Access card deposit (RM, optional)" inputMode="decimal" value={data.accessCardAmount} onChange={(v) => set('accessCardAmount', v)} />
          <Field label="Access card details" value={data.accessCardDetails} placeholder="e.g. Total 2 access cards + 1 carpark RFID" onChange={(v) => set('accessCardDetails', v)} />
        </div>
        <Hint>Schedule Section 11 (Access Card Deposits) only appears when one of these is filled.</Hint>
      </Section>

      {/* Witnesses */}
      <Section title="Witnesses">
        <SubCard title="Landlord's witness">
          <PersonFields person={data.landlordWitness} nameLabel="Name" required src={(f) => src(`landlordWitness.${f}`)} onChange={(p) => set('landlordWitness', p)} />
        </SubCard>
        <SubCard title="Tenant's witness">
          <PersonFields person={data.tenantWitness} nameLabel="Name" required src={(f) => src(`tenantWitness.${f}`)} onChange={(p) => set('tenantWitness', p)} />
        </SubCard>
        <Hint>The landlord&apos;s witness is printed once after all the landlords, and the tenant&apos;s witness once after all the tenants. Schedule II is signed with the landlord and tenant names.</Hint>
      </Section>

      {/* Additional clauses */}
      <Section
        title={`Additional clauses (Section ${template.render.extraClausesAfter})`}
        aside={<LinkButton onClick={() => set('extraClauses', [...data.extraClauses, { id: newId(), margin: '', text: '' }])}>+ Add clause</LinkButton>}
      >
        {data.extraClauses.length === 0 && (
          <Hint>None. Added clauses are numbered after {template.render.extraClausesAfter}.{lastFixedSub} ({template.render.extraClausesAfter}.{lastFixedSub + 1}, {template.render.extraClausesAfter}.{lastFixedSub + 2}, …).</Hint>
        )}
        {data.extraClauses.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-[#332c20] bg-[#141210] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#a89d84]">Clause {template.render.extraClausesAfter}.{lastFixedSub + 1 + i}</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveClause(i, -1)} className="p-1.5 rounded-lg text-[#7c6f54] hover:text-[#f5f0e8] hover:bg-[#262018] disabled:opacity-30">
                  <ArrowUp size={14} />
                </button>
                <button type="button" aria-label="Move down" disabled={i === data.extraClauses.length - 1} onClick={() => moveClause(i, 1)} className="p-1.5 rounded-lg text-[#7c6f54] hover:text-[#f5f0e8] hover:bg-[#262018] disabled:opacity-30">
                  <ArrowDown size={14} />
                </button>
                <button type="button" aria-label="Remove clause" onClick={() => set('extraClauses', data.extraClauses.filter((x) => x.id !== c.id))} className="p-1.5 rounded-lg text-[#7c6f54] hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <Field label="Margin heading (optional)" value={c.margin} onChange={(margin) => set('extraClauses', data.extraClauses.map((x) => (x.id === c.id ? { ...x, margin } : x)))} />
            <Field label="Clause text" multiline value={c.text} onChange={(text) => set('extraClauses', data.extraClauses.map((x) => (x.id === c.id ? { ...x, text } : x)))} />
          </div>
        ))}
        {data.extraClauses.length > 0 && (
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set('extraClauses', [...data.extraClauses, { id: newId(), margin: '', text: '' }])}>
            Add clause
          </Button>
        )}
      </Section>
    </div>
  )
}
