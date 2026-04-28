import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export default function Card({ children, className, onClick, hoverable }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-[#332c20] bg-[#1e1a14] p-4',
        (hoverable || onClick) && 'cursor-pointer hover:border-gold-500/40 hover:bg-[#262018] transition-colors',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-3', className)}>{children}</div>
}

export function CardRow({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', className)}>
      <span className="text-xs text-[#7c6f54]">{label}</span>
      <span className="text-sm text-[#f5f0e8] font-medium">{value}</span>
    </div>
  )
}
