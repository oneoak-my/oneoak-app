'use client'

import { useEffect, useState, useCallback } from 'react'
import { Receipt, Copy, Check, MessageCircle, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { getOutstandingServices, updateService } from '@/lib/api'
import type { Service } from '@/lib/types'
import { formatCurrency, formatDate, generateProviderBillMessage } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'
import { PAYMENT_STATUS_LABELS } from '@/lib/types'

type GroupedProvider = {
  providerId: string
  providerName: string
  bankName: string
  bankAccount: string
  services: Service[]
  total: number
}

export default function BillsPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'proof_sent'>('all')
  const [providerFilter, setProviderFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getOutstandingServices()
      setServices(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Build provider options from current data
  const providerOptions = Array.from(
    new Map(
      services
        .filter((s) => s.provider)
        .map((s) => [s.provider_id ?? 'no-provider', s.provider?.name ?? 'No Provider'])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const filtered = services.filter((s) => {
    const matchStatus = filter === 'all' || s.payment_status === filter
    const matchProvider = providerFilter === 'all' || (s.provider_id ?? 'no-provider') === providerFilter
    return matchStatus && matchProvider
  })

  // Group by provider
  const grouped = filtered.reduce<Record<string, GroupedProvider>>((acc, service) => {
    const key = service.provider_id ?? 'no-provider'
    const providerName = service.provider?.name ?? 'No Provider'
    if (!acc[key]) {
      acc[key] = {
        providerId: key,
        providerName,
        bankName: service.provider?.bank_name ?? '',
        bankAccount: service.provider?.bank_account ?? '',
        services: [],
        total: 0,
      }
    }
    acc[key].services.push(service)
    acc[key].total += service.amount ?? 0
    return acc
  }, {})

  const groupedList = Object.values(grouped).sort((a, b) => b.total - a.total)
  const grandTotal = filtered.reduce((s, sv) => s + (sv.amount ?? 0), 0)

  async function handlePaymentStatus(service: Service, status: Service['payment_status']) {
    try {
      await updateService(service.id, { payment_status: status })
      load()
    } catch (e) {
      console.error(e)
    }
  }

  function exportExcel() {
    import('xlsx').then((XLSX) => {
      const rows: unknown[][] = [
        ['Provider', 'Bank', 'Account', 'Description', 'Unit', 'Tenant', 'Date', 'Status', 'Amount (RM)'],
      ]
      filtered.forEach((s) => {
        rows.push([
          s.provider?.name ?? 'No Provider',
          s.provider?.bank_name ?? '',
          s.provider?.bank_account ?? '',
          s.description,
          s.record?.unit ? `${s.record.unit.unit_number} (${s.record.unit.building})` : '',
          s.record?.tenant_name ?? '',
          s.record?.date ? formatDate(s.record.date) : '',
          PAYMENT_STATUS_LABELS[s.payment_status],
          s.amount ?? 0,
        ])
      })
      rows.push(['', '', '', '', '', '', '', 'TOTAL', grandTotal])

      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Outstanding Bills')
      XLSX.writeFile(wb, `outstanding-bills-${new Date().toISOString().split('T')[0]}.xlsx`)
    })
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#f5f0e8]">Outstanding Bills</h1>
          {!loading && (
            <p className="text-xs text-[#7c6f54] mt-0.5">
              {filtered.length} service{filtered.length !== 1 ? 's' : ''} · {formatCurrency(grandTotal)} total
            </p>
          )}
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#332c20] bg-[#1e1a14] text-xs text-[#a89d84] hover:text-[#f5f0e8] hover:border-gold-500/40 transition-colors"
        >
          <Download size={13} />
          Export
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {(['all', 'unpaid', 'proof_sent'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-gold-500 text-[#0e0c08]'
                : 'bg-[#1e1a14] border border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
            }`}
          >
            {f === 'all' ? 'All Outstanding' : f === 'unpaid' ? 'Unpaid' : 'Proof Sent'}
          </button>
        ))}
      </div>

      {/* Provider filter */}
      {providerOptions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setProviderFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              providerFilter === 'all'
                ? 'bg-[#262018] border border-gold-500/50 text-gold-400'
                : 'bg-[#1e1a14] border border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
            }`}
          >
            All Providers
          </button>
          {providerOptions.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setProviderFilter(id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                providerFilter === id
                  ? 'bg-[#262018] border border-gold-500/50 text-gold-400'
                  : 'bg-[#1e1a14] border border-[#332c20] text-[#7c6f54] hover:text-[#f5f0e8]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#1e1a14] rounded-2xl border border-[#332c20] animate-pulse" />
          ))}
        </div>
      ) : groupedList.length === 0 ? (
        <EmptyState
          icon={<Receipt size={28} />}
          title={filter === 'all' ? 'No outstanding bills' : `No ${filter.replace('_', ' ')} bills`}
          description="All payments are up to date."
        />
      ) : (
        <div className="space-y-3">
          {groupedList.map((group) => (
            <ProviderBillCard
              key={group.providerId}
              group={group}
              onStatusChange={handlePaymentStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProviderBillCard({
  group,
  onStatusChange,
}: {
  group: GroupedProvider
  onStatusChange: (service: Service, status: Service['payment_status']) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const message = generateProviderBillMessage(
    group.providerName,
    group.bankName,
    group.bankAccount,
    group.services,
  )

  function copyMessage() {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function sendWhatsApp() {
    const text = encodeURIComponent(message)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const hasUnpaid = group.services.some((s) => s.payment_status === 'unpaid')
  const hasProofSent = group.services.some((s) => s.payment_status === 'proof_sent')

  return (
    <div className="rounded-2xl border border-[#332c20] bg-[#1e1a14] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#f5f0e8] text-sm truncate">{group.providerName}</p>
            {group.bankName && (
              <p className="text-xs text-[#7c6f54] mt-0.5">
                {group.bankName} · {group.bankAccount}
              </p>
            )}
          </div>
          <div className="ml-3 text-right shrink-0">
            <p className="text-base font-bold text-gold-400">{formatCurrency(group.total)}</p>
            <p className="text-[10px] text-[#5c5040]">{group.services.length} item{group.services.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex gap-1.5 mt-2">
          {hasUnpaid && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 font-medium">
              Unpaid
            </span>
          )}
          {hasProofSent && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 font-medium">
              Proof Sent
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex border-t border-[#332c20]">
        <button
          onClick={copyMessage}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-[#a89d84] hover:text-[#f5f0e8] hover:bg-[#262018] transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy Message'}
        </button>
        <div className="w-px bg-[#332c20]" />
        <button
          onClick={sendWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-emerald-400 hover:bg-[#262018] transition-colors"
        >
          <MessageCircle size={12} />
          WhatsApp
        </button>
        <div className="w-px bg-[#332c20]" />
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-2.5 text-[#5c5040] hover:text-[#a89d84] hover:bg-[#262018] transition-colors"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded service list */}
      {expanded && (
        <div className="border-t border-[#332c20] divide-y divide-[#332c20]">
          {group.services.map((service) => (
            <div key={service.id} className="px-4 py-3">
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#f5f0e8] truncate">{service.description}</p>
                  {service.record?.unit && (
                    <p className="text-[10px] text-[#5c5040] mt-0.5">
                      {service.record.unit.unit_number} · {service.record.unit.building}
                      {service.record.tenant_name && ` · ${service.record.tenant_name}`}
                    </p>
                  )}
                  {service.record?.date && (
                    <p className="text-[10px] text-[#5c5040]">{formatDate(service.record.date)}</p>
                  )}
                </div>
                <p className="text-xs font-semibold text-gold-400 ml-3 shrink-0">{formatCurrency(service.amount)}</p>
              </div>

              {/* Status toggle */}
              <div className="flex gap-1.5 mt-2">
                {(['unpaid', 'proof_sent', 'paid'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(service, s)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors border ${
                      service.payment_status === s
                        ? s === 'unpaid'
                          ? 'bg-red-500/15 border-red-500/30 text-red-400'
                          : s === 'proof_sent'
                          ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-[#262018] border-[#332c20] text-[#5c5040] hover:text-[#7c6f54]'
                    }`}
                  >
                    {PAYMENT_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
