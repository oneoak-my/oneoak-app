import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-gold-500 hover:bg-gold-400 text-[#0e0c08] font-semibold border border-gold-400',
  secondary: 'bg-[#262018] hover:bg-[#2e2719] text-[#f5f0e8] border border-[#332c20]',
  ghost: 'bg-transparent hover:bg-[#262018] text-[#a89d84] hover:text-[#f5f0e8]',
  danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30',
  outline: 'bg-transparent hover:bg-gold-500/10 text-gold-400 border border-gold-500/40',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  fullWidth?: boolean
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}
