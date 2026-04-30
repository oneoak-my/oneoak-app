'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Plus, Trash2, Edit2, Share2, Upload, Check, Clock, X,
  ChevronDown, ChevronUp, Paperclip,
} from 'lucide-react'
import {
  getRecord, updateRecord, deleteRecord,
  createService, updateService, deleteService,
  getServiceProviders, getServiceDescriptions, uploadInvoice, createServiceProvider,
  markReportGenerated, extractError,
} from '@/lib/api'
import type { PropertyRecord, Service, ServiceProvider, ServiceDescription, RecordType, PaymentBy } from '@/lib/types'
import { PAYMENT_STATUS_LABELS, UTILITY_OPTIONS, PAYMENT_BY_CHECKOUT, PAYMENT_BY_OTHER, PAYMENT_BY_COLORS } from '@/lib/types'
import {
  formatDate, formatCurrency, calcRefund,
  generateMoveInReport, generateMoveOutReport, generateMaintenanceReport,
} from '@/lib/utils'
import Badge, { statusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card, { CardRow } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Input, { Select, Textarea } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import TaskSection from '@/components/tasks/TaskSection'

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [record, setRecord] = useState<PropertyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<ServiceProvider[]>([])
  const [descriptions, setDescriptions] = useState<ServiceDescription[]>([])
  const [showAddService, setShowAddService] = useState(false)
  const [showEditRecord, setShowEditRecord] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [showReport, setShowReport] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, p, d] = await Promise.all([
        getRecord(id),
        getServiceProviders(),
        getServiceDescriptions(),
      ])
      setRecord(r)
      setProviders(p)
      setDescriptions(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleDeleteRecord() {
    if (!confirm('Delete this record and all its services?')) return
    try {
      await deleteRecord(id)
      router.push(record?.unit_id ? `/units/${record.unit_id}` : '/')
    } catch (e) {
      console.error(e)
    }
  }

  async function handlePaymentStatus(service: Service, status: Service['payment_status']) {
    try {
      await updateService(service.id, { payment_status: status })
      load()
    } catch (e) {
      console.error(e)
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!confirm('Remove this service?')) return
    try {
      await deleteService(serviceId)
      load()
    } catch (e) {
      console.error(e)
    }
  }

  function getReport(): string {
    if (!record) return ''
    if (record.type === 'checkin') return generateMoveInReport(record)
    if (record.type === 'checkout') return generateMoveOutReport(record)
    return generateMaintenanceReport(record)
  }

  async function copyReport() {
    await navigator.clipboard.writeText(getReport()).catch(console.error)
    if (record && record.unit_id) {
      await markReportGenerated(record.id, record.type, record.unit_id).catch(console.error)
      load()
    }
  }

  async function shareReport() {
    const text = encodeURIComponent(getReport())
    window.open(`https://wa.me/?text=${text}`, '_blank')
    if (record && record.unit_id) {
      await markReportGenerated(record.id, record.type, record.unit_id).catch(console.error)
      load()
    }
  }


  if (loading) {
    return (
      <div className="px-4 py-5 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-[#1e1a14] rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!record) {
    return <EmptyState title="Record not found" action={<Button onClick={() => router.push('/')}>Go back</Button>} />
  }

  const services = record.services ?? []
  const totalServices = services.reduce((s, sv) => s + (sv.amount ?? 0), 0)
  const totalDeductFromDeposit = services
    .filter((s) => s.payment_by === 'Deduct from Deposit')
    .reduce((s, sv) => s + (sv.amount ?? 0), 0)
  const refund = record.type === 'checkout' ? calcRefund(record) : null
  const typeBadge = statusBadge(record.type)
  const hasInvoices = services.some((s) => s.invoice_url || s.invoice_url_2 || s.invoice_url_3)

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/units/${record.unit_id}`)}
          className="flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm cursor-pointer select-none"
          style={{
            minWidth: '80px',
            minHeight: '48px',
            position: 'static',
            transform: 'none',
            marginLeft: '0',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ← {record.unit?.unit_number ?? 'Back'}
        </button>
        <div className="flex items-center gap-2">
          {hasInvoices && (
            <a
              href={`/api/invoice-bundle?recordId=${record.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ minHeight: '48px', minWidth: '48px' }}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-transparent hover:bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8] transition-all duration-150 touch-manipulation"
            >
              <Paperclip size={14} />
              Invoices
            </a>
          )}
          <Button variant="ghost" size="sm" icon={<Share2 size={14} />} onClick={() => setShowReport(true)}>
            Report
          </Button>
          <Button variant="ghost" size="sm" icon={<Edit2 size={14} />} onClick={() => setShowEditRecord(true)} />
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={handleDeleteRecord}
            className="text-red-400 hover:text-red-300" />
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
          {record.status === 'completed' && (
            <Badge variant="gray">Completed</Badge>
          )}
          {record.is_report_generated && (
            <Badge variant="green">Report Sent</Badge>
          )}
        </div>
        <h1 className="text-xl font-bold text-[#f5f0e8]">
          {record.tenant_name ?? 'No tenant'}
        </h1>
        <p className="text-sm text-[#7c6f54] mt-0.5">
          {record.unit?.unit_number} · {record.unit?.building} · {formatDate(record.date)}
        </p>
        {(record.created_by || record.updated_by) && (
          <p style={{ fontSize: '11px' }} className="text-[#4a4030] mt-1">
            {record.created_by && `Created by ${record.created_by}`}
            {record.updated_by && record.updated_by !== record.created_by && ` · Last updated by ${record.updated_by}`}
            {record.updated_at && ` on ${new Date(record.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        )}
      </div>

      {/* Financials card */}
      {(record.monthly_rental || record.security_deposit || record.utility_deposit) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Financials</p>
          {record.monthly_rental && (
            <CardRow label="Monthly Rental" value={formatCurrency(record.monthly_rental)} />
          )}
          {record.security_deposit && (
            <CardRow label="Security Deposit" value={formatCurrency(record.security_deposit)} />
          )}
          {record.utility_deposit && (
            <CardRow label="Utility Deposit" value={formatCurrency(record.utility_deposit)} />
          )}
          {record.security_deposit && record.utility_deposit && (
            <CardRow
              label="Total Deposits"
              value={
                <span className="text-gold-400 font-semibold">
                  {formatCurrency((record.security_deposit ?? 0) + (record.utility_deposit ?? 0))}
                </span>
              }
              className="border-t border-[#332c20] mt-1 pt-2"
            />
          )}
        </Card>
      )}

      {/* Tenancy dates */}
      {(record.move_in_date || record.tenancy_start_date) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Tenancy Details</p>
          {record.move_in_date && (
            <CardRow label="Move-in Date" value={formatDate(record.move_in_date)} />
          )}
          {record.tenancy_start_date && (
            <CardRow
              label="Tenancy Period"
              value={`${formatDate(record.tenancy_start_date)} – ${formatDate(record.tenancy_end_date)}`}
            />
          )}
        </Card>
      )}

      {/* Utility statuses (checkout) */}
      {record.type === 'checkout' && (record.electricity_status || record.water_status || record.indah_water_status || record.gas_status) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Utility Status</p>
          {record.electricity_status && (
            <CardRow label="Electricity" value={
              <span className={record.electricity_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.electricity_status}
              </span>
            } />
          )}
          {record.water_status && (
            <CardRow label="Water" value={
              <span className={record.water_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.water_status}
              </span>
            } />
          )}
          {record.indah_water_status && (
            <CardRow label="Indah Water" value={
              <span className={record.indah_water_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.indah_water_status}
              </span>
            } />
          )}
          {record.gas_status && (
            <CardRow label="Gas" value={
              <span className={record.gas_status === 'No Outstanding' ? 'text-emerald-400' : 'text-red-400'}>
                {record.gas_status}
              </span>
            } />
          )}
        </Card>
      )}

      {/* Checkout refund summary */}
      {record.type === 'checkout' && refund !== null && (
        <Card className={refund >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">
            Deposit Refund Calculation
          </p>
          <CardRow
            label="Total Deposits"
            value={formatCurrency((record.security_deposit ?? 0) + (record.utility_deposit ?? 0))}
          />
          <CardRow label="Total Deductions" value={formatCurrency(totalDeductFromDeposit)} />
          <CardRow
            label="Balance to Refund"
            value={
              <span className={`font-bold text-base ${refund >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(refund)}
              </span>
            }
            className="border-t border-[#332c20] mt-1 pt-2"
          />
        </Card>
      )}

      {/* Tenant bank details (checkout) */}
      {record.type === 'checkout' && (record.tenant_bank_holder || record.tenant_bank_name) && (
        <Card>
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider mb-3">Refund Bank Details</p>
          {record.tenant_bank_holder && (
            <CardRow label="Account Holder" value={record.tenant_bank_holder} />
          )}
          {record.tenant_bank_name && (
            <CardRow label="Bank" value={`${record.tenant_bank_name}${record.tenant_bank_account ? ` · ${record.tenant_bank_account}` : ''}`} />
          )}
        </Card>
      )}

      {/* Notes */}
      <NotesSection record={record} />

      {/* Tasks */}
      <TaskSection record={record} />

      {/* Services */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">
            Services ({services.length})
            {totalServices > 0 && (
              <span className="ml-2 text-gold-400 normal-case font-normal">
                {formatCurrency(totalServices)} total
              </span>
            )}
          </p>
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowAddService(true)}>
            Add
          </Button>
        </div>

        {services.length === 0 ? (
          <EmptyState
            title="No services yet"
            description="Add services, repairs, or charges for this record."
            action={
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddService(true)}>
                Add Service
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={() => setEditingService(service)}
                onDelete={() => handleDeleteService(service.id)}
                onStatusChange={(s) => handlePaymentStatus(service, s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <ServiceModal
        open={showAddService}
        onClose={() => setShowAddService(false)}
        recordId={id}
        recordType={record.type}
        providers={providers}
        descriptions={descriptions}
        onSaved={() => { setShowAddService(false); load() }}
      />

      {editingService && (
        <ServiceModal
          open={!!editingService}
          onClose={() => setEditingService(null)}
          recordId={id}
          recordType={record.type}
          providers={providers}
          descriptions={descriptions}
          editService={editingService}
          onSaved={() => { setEditingService(null); load() }}
        />
      )}

      <EditRecordModal
        record={record}
        open={showEditRecord}
        onClose={() => setShowEditRecord(false)}
        onSaved={() => { setShowEditRecord(false); load() }}
      />

      {/* Report modal */}
      <Modal open={showReport} onClose={() => setShowReport(false)} title="WhatsApp Report">
        <div className="space-y-4">
          <pre className="whitespace-pre-wrap text-sm text-[#a89d84] bg-[#262018] border border-[#332c20] rounded-xl p-4 font-sans leading-relaxed max-h-72 overflow-y-auto">
            {getReport()}
          </pre>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={copyReport}>
              Copy Text
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={shareReport}
              icon={<Share2 size={14} />}
            >
              Send via WhatsApp
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Service Card ──────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  service: Service
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (s: Service['payment_status']) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const paymentColors: { [K in Service['payment_status']]: string } = {
    unpaid: 'text-red-400 border-red-500/30 bg-red-500/10',
    proof_sent: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
    paid: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  }

  return (
    <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] overflow-hidden">
      {/* Main row */}
      <div className="flex items-center px-4 py-3 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#f5f0e8] truncate">{service.description}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {service.provider && (
              <p className="text-xs text-[#7c6f54] truncate">{service.provider.name}</p>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PAYMENT_BY_COLORS[service.payment_by]}`}>
              {service.payment_by}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-gold-400">{formatCurrency(service.amount)}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 p-1 text-[#5c5040] hover:text-[#a89d84]"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Payment status bar */}
      <div className="flex border-t border-[#332c20]">
        {(['unpaid', 'proof_sent', 'paid'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${
              service.payment_status === s
                ? paymentColors[s]
                : 'text-[#5c5040] hover:text-[#7c6f54]'
            }`}
          >
            {s === 'unpaid' && <X size={10} className="inline mr-1" />}
            {s === 'proof_sent' && <Clock size={10} className="inline mr-1" />}
            {s === 'paid' && <Check size={10} className="inline mr-1" />}
            {PAYMENT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#332c20] px-4 py-3 space-y-2">
          {service.provider && (
            <div>
              <p className="text-[10px] text-[#5c5040] uppercase tracking-wide">Bank Details</p>
              <p className="text-xs text-[#a89d84] mt-0.5">
                {service.provider.bank_name} · {service.provider.bank_account}
              </p>
            </div>
          )}
          {[service.invoice_url, service.invoice_url_2, service.invoice_url_3]
            .filter(Boolean)
            .map((url, i, arr) => (
              <a
                key={i}
                href={url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300"
              >
                <Upload size={12} /> View Invoice{arr.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))
          }
          {service.notes && (
            <p className="text-xs text-[#7c6f54]">{service.notes}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm" icon={<Edit2 size={12} />} onClick={onEdit}>
              Edit
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={onDelete}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Service Modal ─────────────────────────────────────────────────────────────

type InvoiceItem = { kind: 'existing'; url: string } | { kind: 'new'; file: File }

function invoiceDisplayName(item: InvoiceItem): string {
  if (item.kind === 'new') return item.file.name
  return item.url.split('/').pop()?.split('?')[0] ?? 'invoice'
}

function ServiceModal({
  open,
  onClose,
  recordId,
  recordType,
  providers,
  descriptions,
  editService,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  recordId: string
  recordType: RecordType
  providers: ServiceProvider[]
  descriptions: ServiceDescription[]
  editService?: Service
  onSaved: () => void
}) {
  const paymentByOptions = recordType === 'checkout' ? PAYMENT_BY_CHECKOUT : PAYMENT_BY_OTHER
  const defaultPaymentBy: PaymentBy = recordType === 'checkout' ? 'Deduct from Deposit' : 'Pay by Owner'

  const [description, setDescription] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [providerId, setProviderId] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualBankName, setManualBankName] = useState('')
  const [manualBankAccount, setManualBankAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentBy, setPaymentBy] = useState<PaymentBy>(defaultPaymentBy)
  const [notes, setNotes] = useState('')
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset or pre-fill whenever modal opens
  useEffect(() => {
    if (!open) return
    setError('')
    if (editService) {
      setDescription(editService.description)
      setCustomDescription('')
      setProviderId(editService.provider_id ?? '')
      setManualMode(false)
      setManualName('')
      setManualBankName('')
      setManualBankAccount('')
      setAmount(String(editService.amount))
      setPaymentBy(editService.payment_by)
      setNotes(editService.notes ?? '')
      const existing: InvoiceItem[] = []
      if (editService.invoice_url) existing.push({ kind: 'existing', url: editService.invoice_url })
      if (editService.invoice_url_2) existing.push({ kind: 'existing', url: editService.invoice_url_2 })
      if (editService.invoice_url_3) existing.push({ kind: 'existing', url: editService.invoice_url_3 })
      setInvoices(existing)
    } else {
      setDescription('')
      setCustomDescription('')
      setProviderId('')
      setManualMode(false)
      setManualName('')
      setManualBankName('')
      setManualBankAccount('')
      setAmount('')
      setPaymentBy(defaultPaymentBy)
      setNotes('')
      setInvoices([])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProvider = providers.find((p) => p.id === providerId)
  const isOthers = description === 'Others'

  function handleProviderChange(value: string) {
    if (value === '__manual__') {
      setManualMode(true)
      setProviderId('')
    } else {
      setProviderId(value)
    }
  }

  function addInvoiceFile(file: File) {
    if (invoices.length >= 3) return
    setInvoices((prev) => [...prev, { kind: 'new', file }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const finalDescription = isOthers ? customDescription.trim() : description
    if (!finalDescription) { setError('Please select or enter a description.'); return }
    if (!amount || isNaN(parseFloat(amount))) { setError('Please enter a valid amount.'); return }

    setLoading(true)
    setError('')
    try {
      // Resolve provider
      let resolvedProviderId: string | null = providerId || null
      if (manualMode && manualName.trim()) {
        const created = await createServiceProvider({
          name: manualName.trim(),
          bank_name: manualBankName.trim() || undefined,
          bank_account: manualBankAccount.trim() || undefined,
        })
        resolvedProviderId = created.id
      }

      const serviceData = {
        record_id: recordId,
        description: finalDescription,
        provider_id: resolvedProviderId,
        amount: parseFloat(amount),
        payment_by: paymentBy,
        notes: notes.trim() || null,
        invoice_url: null as string | null,
        invoice_url_2: null as string | null,
        invoice_url_3: null as string | null,
      }

      let savedServiceId = editService?.id

      if (editService) {
        await updateService(editService.id, serviceData)
      } else {
        const created = await createService(serviceData)
        savedServiceId = created.id
      }

      // Upload any new invoices; keep existing URLs in their slots
      if (savedServiceId) {
        const urls: (string | null)[] = [null, null, null]
        for (let i = 0; i < Math.min(invoices.length, 3); i++) {
          const item = invoices[i]
          if (item.kind === 'existing') {
            urls[i] = item.url
          } else {
            urls[i] = await uploadInvoice(item.file, savedServiceId, (i + 1) as 1 | 2 | 3)
          }
        }
        await updateService(savedServiceId, {
          invoice_url: urls[0],
          invoice_url_2: urls[1],
          invoice_url_3: urls[2],
        })
      }

      onSaved()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editService ? 'Edit Service' : 'Add Service'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Service Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Select description…"
          options={descriptions.map((d) => ({ value: d.description, label: d.description }))}
        />
        {isOthers && (
          <Input
            label="Custom Description"
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            placeholder="Describe the service…"
          />
        )}

        {/* Provider — dropdown or manual input */}
        {!manualMode ? (
          <Select
            label="Service Provider"
            value={providerId}
            onChange={(e) => handleProviderChange(e.target.value)}
            placeholder="Select provider (optional)…"
            options={[
              ...providers.map((p) => ({ value: p.id, label: p.name })),
              { value: '__manual__', label: 'Type manually...' },
            ]}
          />
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-xs text-[#7c6f54] hover:text-[#a89d84] transition-colors"
            >
              ← Back to list
            </button>
            <Input
              label="Provider Name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Sia Geok Ling"
            />
            <Input
              label="Bank Name"
              value={manualBankName}
              onChange={(e) => setManualBankName(e.target.value)}
              placeholder="e.g. Maybank"
            />
            <Input
              label="Account Number"
              value={manualBankAccount}
              onChange={(e) => setManualBankAccount(e.target.value)}
              placeholder="e.g. 1234 5678"
            />
          </div>
        )}

        {!manualMode && selectedProvider && (
          <div className="rounded-xl bg-[#262018] border border-[#332c20] px-3 py-2.5">
            <p className="text-[10px] text-[#5c5040] uppercase tracking-wide mb-1">Bank Details</p>
            <p className="text-xs text-[#a89d84]">
              {selectedProvider.bank_name} · {selectedProvider.bank_account}
            </p>
          </div>
        )}

        <Input
          label="Amount (RM)"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          prefix="RM"
        />
        <Select
          label="Payment by"
          value={paymentBy}
          onChange={(e) => setPaymentBy(e.target.value as PaymentBy)}
          options={paymentByOptions.map((v) => ({ value: v, label: v }))}
        />
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes…"
        />

        {/* Invoice upload — up to 3 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#a89d84]">
            Invoices (optional)
          </label>
          {invoices.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#262018] border border-[#332c20]">
              <Upload size={12} className="text-[#7c6f54] shrink-0" />
              <span className="text-xs text-[#a89d84] flex-1 truncate">{invoiceDisplayName(item)}</span>
              <button
                type="button"
                onClick={() => setInvoices((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-red-400 hover:text-red-300 transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {invoices.length < 3 && (
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[#332c20] bg-[#262018] cursor-pointer hover:border-gold-500/40 transition-colors">
              <Upload size={14} className="text-[#7c6f54]" />
              <span className="text-xs text-[#7c6f54]">
                {invoices.length === 0 ? 'Upload invoice…' : `Upload invoice (${invoices.length}/3 uploaded)`}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) addInvoiceFile(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
          {invoices.length === 3 && (
            <p className="text-[10px] text-[#5c5040]">Maximum 3 invoices reached.</p>
          )}
        </div>

        {editService?.created_by && (
          <p className="text-[11px] text-[#4a4030]">Added by {editService.created_by}</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>
            {editService ? 'Save Changes' : 'Add Service'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edit Record Modal ─────────────────────────────────────────────────────────

function EditRecordModal({
  record,
  open,
  onClose,
  onSaved,
}: {
  record: PropertyRecord
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [tenantName, setTenantName] = useState(record.tenant_name ?? '')
  const [date, setDate] = useState(record.date)
  const [monthlyRental, setMonthlyRental] = useState(String(record.monthly_rental ?? ''))
  const [securityDeposit, setSecurityDeposit] = useState(String(record.security_deposit ?? ''))
  const [utilityDeposit, setUtilityDeposit] = useState(String(record.utility_deposit ?? ''))
  const [notes, setNotes] = useState(record.notes ?? '')
  const [status, setStatus] = useState(record.status)
  // Tenancy
  const [moveInDate, setMoveInDate] = useState(record.move_in_date ?? '')
  const [tenancyStart, setTenancyStart] = useState(record.tenancy_start_date ?? '')
  const [tenancyEnd, setTenancyEnd] = useState(record.tenancy_end_date ?? '')
  // Checkout utility
  const [electricityStatus, setElectricityStatus] = useState(record.electricity_status ?? '')
  const [waterStatus, setWaterStatus] = useState(record.water_status ?? '')
  const [indahWaterStatus, setIndahWaterStatus] = useState(record.indah_water_status ?? '')
  const [gasStatus, setGasStatus] = useState(record.gas_status ?? '')
  // Checkout bank
  const [bankHolder, setBankHolder] = useState(record.tenant_bank_holder ?? '')
  const [bankName, setBankName] = useState(record.tenant_bank_name ?? '')
  const [bankAccount, setBankAccount] = useState(record.tenant_bank_account ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function autoFillDeposits() {
    const rental = parseFloat(monthlyRental)
    if (!isNaN(rental) && rental > 0) {
      setSecurityDeposit(String(rental * 2))
      setUtilityDeposit(String(rental * 0.5))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await updateRecord(record.id, {
        tenant_name: tenantName.trim() || null,
        date,
        monthly_rental: parseFloat(monthlyRental) || null,
        security_deposit: parseFloat(securityDeposit) || null,
        utility_deposit: parseFloat(utilityDeposit) || null,
        notes: notes.trim() || null,
        status,
        move_in_date: moveInDate || null,
        tenancy_start_date: tenancyStart || null,
        tenancy_end_date: tenancyEnd || null,
        electricity_status: (electricityStatus as PropertyRecord['electricity_status']) || null,
        water_status: (waterStatus as PropertyRecord['water_status']) || null,
        indah_water_status: (indahWaterStatus as PropertyRecord['indah_water_status']) || null,
        gas_status: (gasStatus as PropertyRecord['gas_status']) || null,
        tenant_bank_holder: bankHolder.trim() || null,
        tenant_bank_name: bankName.trim() || null,
        tenant_bank_account: bankAccount.trim() || null,
      })
      onSaved()
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Record">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Tenant Name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {record.type === 'checkin' && (
          <Input label="Move-in Date" type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
        )}
        {record.type !== 'maintenance' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tenancy Start" type="date" value={tenancyStart} onChange={(e) => setTenancyStart(e.target.value)} />
            <Input label="Tenancy End" type="date" value={tenancyEnd} onChange={(e) => setTenancyEnd(e.target.value)} />
          </div>
        )}
        {record.type !== 'maintenance' && (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Monthly Rental (RM)"
                  type="number"
                  value={monthlyRental}
                  onChange={(e) => setMonthlyRental(e.target.value)}
                  prefix="RM"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={autoFillDeposits}>
                Auto-fill
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Security Deposit"
                type="number"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(e.target.value)}
                prefix="RM"
              />
              <Input
                label="Utility Deposit"
                type="number"
                value={utilityDeposit}
                onChange={(e) => setUtilityDeposit(e.target.value)}
                prefix="RM"
              />
            </div>
          </>
        )}
        {record.type === 'checkout' && (
          <>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Utility Status</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Electricity" value={electricityStatus} onChange={(e) => setElectricityStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
              <Select label="Water" value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
              <Select label="Indah Water" value={indahWaterStatus} onChange={(e) => setIndahWaterStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
              <Select label="Gas" value={gasStatus} onChange={(e) => setGasStatus(e.target.value)} placeholder="Select…" options={UTILITY_OPTIONS} />
            </div>
            <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider pt-1">Refund Bank Details</p>
            <Input label="Account Holder" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <Input label="Account No." value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
          </>
        )}
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PropertyRecord['status'])}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" type="button" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" fullWidth loading={loading}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Notes Section ─────────────────────────────────────────────────────────────

function fmtDateTime(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function NotesSection({ record }: { record: PropertyRecord }) {
  const [value, setValue] = useState(record.notes ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow: recalculate height whenever value changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(100, el.scrollHeight) + 'px'
  }, [value])

  // Clear pending timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setValue(text)
    setSaveState('idle')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await updateRecord(record.id, { notes: text.trim() || null })
        setLastSavedAt(new Date())
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 2000)
      } catch (err) {
        console.error('[NotesSection] save error:', err)
        setSaveState('idle')
      }
    }, 1000)
  }

  const displayTimestamp = lastSavedAt
    ? fmtDateTime(lastSavedAt)
    : record.updated_at ? fmtDateTime(new Date(record.updated_at)) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">Notes</p>
        <span className={`text-xs transition-opacity duration-500 ${
          saveState === 'saving' ? 'opacity-100 text-[#5c5040]'
          : saveState === 'saved' ? 'opacity-100 text-emerald-400'
          : 'opacity-0'
        }`}>
          {saveState === 'saving' ? 'Saving…' : 'Saved ✓'}
        </span>
      </div>
      <div className="rounded-xl border border-[#332c20] bg-[#1e1a14] overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder="Add notes about this unit, progress updates, or important information..."
          className="w-full px-4 py-3 text-sm text-[#f5f0e8] placeholder-[#4a4030] bg-transparent resize-none outline-none leading-relaxed"
          style={{ minHeight: '100px' }}
        />
      </div>
      {displayTimestamp && (
        <p className="text-[10px] text-[#5c5040]">Last updated: {displayTimestamp}</p>
      )}
    </div>
  )
}
