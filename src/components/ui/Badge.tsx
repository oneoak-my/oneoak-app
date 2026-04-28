import { cn } from '@/lib/utils'
import type { BadgeVariant, UnitStatusTag } from '@/lib/types'
import { UNIT_TAG_STYLES } from '@/lib/types'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  gold:   'bg-gold-500/20 text-gold-300 border-gold-500/30',
  green:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  red:    'bg-red-500/20 text-red-300 border-red-500/30',
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  gray:   'bg-[#332c20] text-[#a89d84] border-[#3d3628]',
  blue:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  yellow: 'bg-yellow-500 text-black border-yellow-600',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export default function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
      VARIANT_CLASSES[variant],
      className,
    )}>
      {children}
    </span>
  )
}

export function UnitTagBadges({ tags }: { tags: UnitStatusTag[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const style = UNIT_TAG_STYLES[tag]
        if (!style) return null
        return (
          <Badge key={tag} variant={style.variant}>
            {style.label}
          </Badge>
        )
      })}
    </div>
  )
}

export function statusBadge(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'checkin':     return { variant: 'blue',   label: 'Check-in' }
    case 'checkout':    return { variant: 'red',    label: 'Check-out' }
    case 'maintenance': return { variant: 'orange', label: 'Maintenance' }
    case 'paid':        return { variant: 'green',  label: 'Paid' }
    case 'proof_sent':  return { variant: 'orange', label: 'Proof Sent' }
    case 'unpaid':      return { variant: 'red',    label: 'Unpaid' }
    default:            return { variant: 'gray',   label: status }
  }
}
