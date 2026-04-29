import type { ClassValue } from 'clsx'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import type { PropertyRecord, Service } from './types'

export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(' ')
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'RM 0.00'
  return `RM ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try { return format(parseISO(dateStr), 'd MMM yyyy') } catch { return dateStr }
}

export function daysUntil(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), new Date())
}

export function calcDeposits(monthlyRental: number) {
  return {
    security: monthlyRental * 2,
    utility:  monthlyRental * 0.5,
    total:    monthlyRental * 2.5,
  }
}

export function calcRefund(record: PropertyRecord): number {
  const totalDeposits = (record.security_deposit ?? 0) + (record.utility_deposit ?? 0)
  const totalDeductions = (record.services ?? [])
    .filter((s) => s.payment_by === 'Deduct from Deposit')
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  return totalDeposits - totalDeductions
}

// ── WhatsApp Reports ──────────────────────────────────────────────────────────

type ProviderGroup = {
  providerName: string
  bankName: string
  bankAccount: string
  services: Service[]
  total: number
}

function groupByProvider(services: Service[]): ProviderGroup[] {
  const map = new Map<string, ProviderGroup>()
  for (const s of services) {
    const key = s.provider?.name ?? 'Others'
    if (!map.has(key)) {
      map.set(key, {
        providerName: s.provider?.name ?? 'Others',
        bankName: s.provider?.bank_name ?? '',
        bankAccount: s.provider?.bank_account ?? '',
        services: [],
        total: 0,
      })
    }
    const g = map.get(key)!
    g.services.push(s)
    g.total += s.amount ?? 0
  }
  return Array.from(map.values())
}

// Block for check-in / maintenance reports
function providerBlock(g: ProviderGroup): string[] {
  const lines: string[] = []
  if (g.services.length === 1) {
    const s = g.services[0]
    lines.push(`✅ Pay to: ${g.providerName}`)
    lines.push(`Services: ${s.description}`)
    if (s.notes) lines.push(s.notes)
    lines.push(`Amount: ${formatCurrency(s.amount)}`)
  } else {
    lines.push(`✅ Pay to: ${g.providerName}`)
    lines.push(`Services:`)
    g.services.forEach((s) => {
      lines.push(`- ${s.description}: ${formatCurrency(s.amount)}`)
      if (s.notes) lines.push(`  - ${s.notes}`)
    })
    lines.push(`Total: ${formatCurrency(g.total)}`)
  }
  if (g.bankName && g.bankAccount) {
    lines.push(`👉 Bank Details:`, `${g.providerName} | ${g.bankName} | ${g.bankAccount}`)
  }
  return lines
}

export function generateMoveInReport(record: PropertyRecord): string {
  const unit = record.unit
  const services = record.services ?? []

  const lines: string[] = [
    `🏠 *MOVE-IN REPORT*`,
    `📍 Unit: ${unit?.unit_number ?? ''} | ${unit?.building ?? ''}`,
    `👤 Tenant: ${record.tenant_name ?? ''}`,
    `📅 Move-in Date: ${formatDate(record.move_in_date ?? record.date)}`,
    record.tenancy_start_date ? `📋 Tenancy: ${formatDate(record.tenancy_start_date)} – ${formatDate(record.tenancy_end_date)}` : '',
    ``,
    `💰 *Financials*`,
    `• Monthly Rental: ${formatCurrency(record.monthly_rental)}`,
    `• Security Deposit: ${formatCurrency(record.security_deposit)}`,
    `• Utility Deposit: ${formatCurrency(record.utility_deposit)}`,
    `• Total Collected: ${formatCurrency((record.security_deposit ?? 0) + (record.utility_deposit ?? 0))}`,
  ].filter((l) => l !== undefined) as string[]

  if (services.length > 0) {
    lines.push(``, `🔧 *Services*`)
    groupByProvider(services).forEach((g) => {
      lines.push(``, ...providerBlock(g))
    })
    lines.push(``, `*Total Services: ${formatCurrency(services.reduce((sum, s) => sum + s.amount, 0))}*`)
  }

  if (record.notes) lines.push(``, `📝 Notes: ${record.notes}`)
  lines.push(``, `Once payment is made, kindly share with us the proof of payment. Thank you! 🙏`)
  return lines.join('\n')
}

const ROMAN_NUMERALS = [
  'I','II','III','IV','V','VI','VII','VIII','IX','X',
  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX',
]

export function generateMoveOutReport(record: PropertyRecord): string {
  const unit = record.unit
  const services = record.services ?? []

  // Only "Deduct from Deposit" services count toward the balance — sum all of them first
  const deductServices = services.filter((s) => s.payment_by === 'Deduct from Deposit')
  const totalDeposits = (record.security_deposit ?? 0) + (record.utility_deposit ?? 0)
  const totalDeductions = deductServices.reduce((sum, s) => sum + s.amount, 0)
  const balance = totalDeposits - totalDeductions

  const lines: string[] = [
    `🏠 *MOVE-OUT REPORT*`,
    `📍 Unit: ${unit?.unit_number ?? ''} | ${unit?.building ?? ''}`,
    `👤 Tenant: ${record.tenant_name ?? ''}`,
    `📅 Move-out Date: ${formatDate(record.date)}`,
    `💰 Monthly Rental: ${formatCurrency(record.monthly_rental)}`,
    ``,
    `🔌 *Utility Status*`,
    `- Electricity: ${record.electricity_status ?? '—'}`,
    `- Water: ${record.water_status ?? '—'}`,
    `- Indah Water: ${record.indah_water_status ?? '—'}`,
    `- Gas: ${record.gas_status ?? '—'}`,
    ``,
    `💰 *Deposit Summary*`,
    `- Security Deposit: ${formatCurrency(record.security_deposit)}`,
    `- Utility Deposit: ${formatCurrency(record.utility_deposit)}`,
    `- Total Deposits: ${formatCurrency(totalDeposits)}`,
    ``,
    `📋 *Deductions*`,
  ]

  if (deductServices.length === 0) {
    lines.push(`- Nil`)
  } else {
    // Group deduct services by provider — one roman numeral per provider group
    const deductGroups = groupByProvider(deductServices)
    deductGroups.forEach((g, i) => {
      const numeral = ROMAN_NUMERALS[i] ?? String(i + 1)
      if (g.services.length === 1) {
        const s = g.services[0]
        lines.push(`${numeral}) ${s.description}`)
        if (s.notes) lines.push(`- ${s.notes}`)
        lines.push(`Amount: ${formatCurrency(s.amount)}`)
      } else {
        lines.push(`${numeral}) ${g.providerName}`)
        g.services.forEach((s) => {
          lines.push(`   - ${s.description}: ${formatCurrency(s.amount)}`)
          if (s.notes) lines.push(`     ${s.notes}`)
        })
        lines.push(`   Total: ${formatCurrency(g.total)}`)
      }
      if (i < deductGroups.length - 1) lines.push(``)
    })
  }

  lines.push(``)
  lines.push(`- Total Deductions: ${formatCurrency(totalDeductions)}`)
  lines.push(``)

  if (balance >= 0) {
    lines.push(`💵 *Balance Refundable Deposit: ${formatCurrency(balance)}*`)
  } else {
    lines.push(`💵 ❗ Tenant owes: ${formatCurrency(Math.abs(balance))}`)
  }

  // Tenant bank details — only if any field is filled
  if (record.tenant_bank_holder || record.tenant_bank_name || record.tenant_bank_account) {
    lines.push(
      ``,
      `🏦 *Tenant Bank Details*`,
      `${record.tenant_bank_holder ?? ''} | ${record.tenant_bank_name ?? ''} | ${record.tenant_bank_account ?? ''}`,
    )
  }

  // Attention to Owner — Deduct from Deposit or Pay by Owner, grouped by provider
  const ownerServices = services.filter(
    (s) =>
      (s.payment_by === 'Deduct from Deposit' || s.payment_by === 'Pay by Owner') &&
      s.provider && s.provider.bank_name && s.provider.bank_account,
  )

  if (ownerServices.length > 0) {
    lines.push(
      ``,
      `---`,
      ``,
      `📌 *Attention to Owner*`,
      `Kindly make payment to the following service providers:`,
    )
    groupByProvider(ownerServices).forEach((g) => {
      lines.push(``)
      if (g.services.length === 1) {
        const s = g.services[0]
        lines.push(`* ${s.description}`)
        if (s.notes) lines.push(`- ${s.notes}`)
        lines.push(`Amount: ${formatCurrency(s.amount)}`)
        lines.push(`👉 ${g.providerName} | ${g.bankName} | ${g.bankAccount}`)
      } else {
        lines.push(`* ${g.providerName}`)
        g.services.forEach((s) => {
          lines.push(`  - ${s.description}: ${formatCurrency(s.amount)}`)
          if (s.notes) lines.push(`    ${s.notes}`)
        })
        lines.push(`Total amount: ${formatCurrency(g.total)}`)
        lines.push(`👉 ${g.providerName} | ${g.bankName} | ${g.bankAccount}`)
      }
    })
  }

  lines.push(``, `Once payment is made, kindly share with us the proof of payment. Thank you! 🙏`)
  return lines.join('\n')
}

export function generateMaintenanceReport(record: PropertyRecord): string {
  const unit = record.unit
  const services = record.services ?? []
  const total = services.reduce((sum, s) => sum + s.amount, 0)

  const lines: string[] = [
    `🔧 *MAINTENANCE REPORT*`,
    `📍 Unit: ${unit?.unit_number ?? ''} | ${unit?.building ?? ''}`,
    `📅 Date: ${formatDate(record.date)}`,
  ]

  if (record.tenant_name) lines.push(`👤 Tenant: ${record.tenant_name}`)

  if (services.length > 0) {
    lines.push(``, `🛠️ *Services*`)
    groupByProvider(services).forEach((g) => {
      lines.push(``, ...providerBlock(g))
    })
    lines.push(``, `*Total: ${formatCurrency(total)}*`)
  }

  if (record.notes) lines.push(``, `📝 Notes: ${record.notes}`)
  lines.push(``, `Once payment is made, kindly share with us the proof of payment. Thank you! 🙏`)
  return lines.join('\n')
}

export function generateProviderBillMessage(
  providerName: string,
  bankName: string,
  bankAccount: string,
  services: Service[],
): string {
  const total = services.reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const lines: string[] = [
    `Hi ${providerName},`,
    ``,
    `Please find below payment details for the following services:`,
    ``,
  ]
  services.forEach((s) => {
    const unit = s.record?.unit
    lines.push(
      `• ${s.description}${unit ? ` @ ${unit.unit_number} (${unit.building})` : ''}: ${formatCurrency(s.amount)}`,
    )
  })
  lines.push(
    ``,
    `*Total: ${formatCurrency(total)}*`,
    ``,
    `Bank: ${bankName}`,
    `Account: ${bankAccount}`,
    ``,
    `Thank you!`,
    `One Oak`,
  )
  return lines.join('\n')
}
