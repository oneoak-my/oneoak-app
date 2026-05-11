'use client'

import { useState, useRef } from 'react'
import { Upload, Download, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createUnit, createRecord, updateUnit, extractError } from '@/lib/api'

const CSV_TEMPLATE = [
  '# Building options: Ooak Suites / Ooak Residence / Other',
  '# Lister options: Elleen / Tony Ong / Vivian / Others',
  '# Leave tenant_name and rental blank if no tenant yet',
  '# Date format: YYYY-MM-DD',
  'unit_number,building,lister,tenant_name,monthly_rental,tenancy_start_date,tenancy_end_date',
  'B-17-11,Ooak Suites,Tony Ong,John Smith,5000,2025-01-01,2026-01-01',
  'A-32-06,Ooak Residence,Vivian,,,,',
].join('\n')

interface ParsedRow {
  index: number
  unit_number: string
  building: string
  lister: string
  tenant_name: string
  monthly_rental: string
  tenancy_start_date: string
  tenancy_end_date: string
  hasTenant: boolean
  errors: string[]
  warnings: string[]
}

interface ImportResults {
  succeeded: number
  withCheckin: number
  failed: string[]
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"' && !inQuotes) { inQuotes = true; continue }
    if (c === '"' && inQuotes) { inQuotes = false; continue }
    if (c === ',' && !inQuotes) { fields.push(field.trim()); field = ''; continue }
    field += c
  }
  fields.push(field.trim())
  return fields
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
}

function parseAndValidate(text: string): ParsedRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (lines.length < 2) return []

  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s/g, '_'))
  const dataLines = lines.slice(1)

  const col = (name: string) => header.indexOf(name)
  const idxUnit    = col('unit_number')
  const idxBldg   = col('building')
  const idxLister  = col('lister')
  const idxTenant  = col('tenant_name')
  const idxRental  = col('monthly_rental')
  const idxStart   = col('tenancy_start_date')
  const idxEnd     = col('tenancy_end_date')

  const seen = new Map<string, number>()

  return dataLines.map((line, i) => {
    const f = parseCSVLine(line)
    const get = (idx: number) => (idx >= 0 && idx < f.length ? f[idx] : '').trim()

    const unit_number       = get(idxUnit)
    const building          = get(idxBldg)
    const lister            = get(idxLister)
    const tenant_name       = get(idxTenant)
    const monthly_rental    = get(idxRental)
    const tenancy_start_date = get(idxStart)
    const tenancy_end_date  = get(idxEnd)
    const hasTenant = !!tenant_name

    const errors: string[] = []
    const warnings: string[] = []

    if (!unit_number) errors.push('Unit number is required')
    if (!building)    errors.push('Building is required')

    if (hasTenant) {
      if (tenancy_start_date && !isValidDate(tenancy_start_date))
        warnings.push('Invalid start date (use YYYY-MM-DD)')
      if (tenancy_end_date && !isValidDate(tenancy_end_date))
        warnings.push('Invalid end date (use YYYY-MM-DD)')
    }

    if (unit_number) {
      if (seen.has(unit_number)) {
        warnings.push(`Duplicate unit number (also at row ${seen.get(unit_number)! + 2})`)
      } else {
        seen.set(unit_number, i)
      }
    }

    return {
      index: i, unit_number, building, lister, tenant_name,
      monthly_rental, tenancy_start_date, tenancy_end_date,
      hasTenant, errors, warnings,
    }
  })
}

export default function BulkUploadModal({
  open, onClose, onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ImportResults>({ succeeded: 0, withCheckin: 0, failed: [] })
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setRows([])
    setProgress({ done: 0, total: 0 })
    setResults({ succeeded: 0, withCheckin: 0, failed: [] })
  }

  function handleClose() {
    if (step === 'importing') return
    reset()
    onClose()
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'oneoak_units_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseAndValidate(ev.target?.result as string)
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    const valid = rows.filter(r => r.errors.length === 0)
    setProgress({ done: 0, total: valid.length })
    setStep('importing')

    let succeeded = 0
    let withCheckin = 0
    const failed: string[] = []

    for (let i = 0; i < valid.length; i++) {
      const row = valid[i]
      try {
        const unit = await createUnit({
          unit_number: row.unit_number,
          building: row.building,
          lister: row.lister || null,
          status: [],
        })

        if (row.hasTenant) {
          const rental = parseFloat(row.monthly_rental) || 0
          const startDate = isValidDate(row.tenancy_start_date)
            ? row.tenancy_start_date
            : new Date().toISOString().split('T')[0]

          await createRecord({
            unit_id: unit.id,
            type: 'checkin',
            tenant_name: row.tenant_name,
            monthly_rental: rental,
            security_deposit: rental * 2,
            utility_deposit: rental * 0.5,
            tenancy_start_date: row.tenancy_start_date || null,
            tenancy_end_date: row.tenancy_end_date || null,
            move_in_date: startDate,
            record_status: 'Active Tenancy',
            status: 'active',
            date: startDate,
          })

          // Replace auto-added 'Check-in WIP' with 'Tenanted'
          await updateUnit(unit.id, { status: ['Tenanted'] })
          withCheckin++
        }

        succeeded++
      } catch (err) {
        console.error(`Bulk upload failed for row ${i}:`, extractError(err))
        failed.push(row.unit_number || `Row ${row.index + 2}`)
      }

      setProgress({ done: i + 1, total: valid.length })
    }

    setResults({ succeeded, withCheckin, failed })
    onDone()
    setStep('done')
  }

  const valid   = rows.filter(r => r.errors.length === 0)
  const errRows = rows.filter(r => r.errors.length > 0)
  const withTnt = valid.filter(r => r.hasTenant)

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Upload Units" size="lg">

      {/* ── STEP 1: Upload ───────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#332c20] bg-[#17140f] p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              <p className="text-sm font-medium text-[#f5f0e8]">Download the CSV template</p>
            </div>
            <p className="text-xs text-[#7c6f54] pl-7.5">
              Fill in your units. Leave tenant fields blank for vacant units.
            </p>
            <div className="pl-7">
              <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[#332c20] bg-[#17140f] p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <p className="text-sm font-medium text-[#f5f0e8]">Upload your filled CSV</p>
            </div>
            <div
              className="ml-7 border-2 border-dashed border-[#332c20] rounded-xl p-8 text-center cursor-pointer hover:border-gold-500/40 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={22} className="mx-auto text-[#5c5040] mb-2" />
              <p className="text-sm text-[#7c6f54]">Click to select CSV file</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ──────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="rounded-xl border border-[#332c20] bg-[#17140f] px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-[#f5f0e8]">{valid.length} unit{valid.length !== 1 ? 's' : ''} to create</span>
            <span className="text-[#332c20]">·</span>
            <span className="text-xs text-[#7c6f54]">{withTnt.length} with check-in records</span>
            {errRows.length > 0 && (
              <>
                <span className="text-[#332c20]">·</span>
                <span className="text-xs text-red-400">{errRows.length} row{errRows.length !== 1 ? 's' : ''} with errors (will skip)</span>
              </>
            )}
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-xl border border-[#332c20] max-h-64 overflow-y-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="sticky top-0 bg-[#17140f]">
                <tr className="border-b border-[#332c20]">
                  {['Unit', 'Building', 'Lister', 'Tenant', 'Rental/mo', 'Dates', 'Action'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-[#7c6f54] font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.index} className={`border-b border-[#1e1a14] ${row.errors.length > 0 ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2 font-medium text-[#f5f0e8] whitespace-nowrap">
                      {row.unit_number || <span className="text-red-400 italic">missing</span>}
                    </td>
                    <td className="px-3 py-2 text-[#a89d84] whitespace-nowrap">
                      {row.building || <span className="text-red-400 italic">missing</span>}
                    </td>
                    <td className="px-3 py-2 text-[#7c6f54] whitespace-nowrap">{row.lister || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.tenant_name
                        ? <span className="text-[#f5f0e8]">{row.tenant_name}</span>
                        : <span className="text-[#4a4030]">No tenant</span>}
                    </td>
                    <td className="px-3 py-2 text-[#a89d84] whitespace-nowrap">
                      {row.monthly_rental ? `RM ${row.monthly_rental}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#7c6f54] whitespace-nowrap text-[11px]">
                      {row.tenancy_start_date || row.tenancy_end_date
                        ? `${row.tenancy_start_date || '?'} → ${row.tenancy_end_date || '?'}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.errors.length > 0
                        ? <span className="text-red-400 font-medium">Skip</span>
                        : row.hasTenant
                          ? <span className="text-blue-400">Unit + Check-in</span>
                          : <span className="text-[#7c6f54]">Unit only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Validation messages */}
          {rows.some(r => r.errors.length > 0 || r.warnings.length > 0) && (
            <div className="space-y-1">
              {rows.map(row => {
                const msgs = [
                  ...row.errors.map(e => ({ type: 'error' as const, msg: e })),
                  ...row.warnings.map(w => ({ type: 'warning' as const, msg: w })),
                ]
                return msgs.map((m, j) => (
                  <div key={`${row.index}-${j}`} className={`flex items-center gap-1.5 text-xs ${m.type === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {m.type === 'error' ? <AlertCircle size={11} /> : <AlertTriangle size={11} />}
                    <span>Row {row.index + 2} ({row.unit_number || 'no unit'}): {m.msg}</span>
                  </div>
                ))
              })}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => { setStep('upload'); setRows([]) }}>
              Back
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={valid.length === 0}
              onClick={handleImport}
            >
              Import {valid.length} Unit{valid.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Importing ────────────────────────────── */}
      {step === 'importing' && (
        <div className="py-10 text-center space-y-5">
          <p className="text-sm text-[#7c6f54]">Importing…</p>
          <p className="text-3xl font-bold text-gold-400 tabular-nums">
            {progress.done}/{progress.total}
          </p>
          <p className="text-xs text-[#5c5040]">units done</p>
          <div className="w-full bg-[#332c20] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gold-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ─────────────────────────────────── */}
      {step === 'done' && (
        <div className="py-8 space-y-5">
          <div className="text-center space-y-3">
            <CheckCircle size={40} className="mx-auto text-emerald-400" />
            {results.failed.length === 0 ? (
              <p className="text-[#f5f0e8] font-medium">
                ✅ {results.succeeded} unit{results.succeeded !== 1 ? 's' : ''} imported
                {results.withCheckin > 0 ? ` (${results.withCheckin} with check-in records)` : ''}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[#f5f0e8] font-medium">
                  {results.succeeded} imported successfully, {results.failed.length} failed
                </p>
                <div className="flex items-start gap-1.5 justify-center text-xs text-red-400">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>Failed: {results.failed.join(', ')}</span>
                </div>
              </div>
            )}
          </div>
          <Button variant="primary" fullWidth onClick={handleClose}>
            Done
          </Button>
        </div>
      )}

    </Modal>
  )
}
