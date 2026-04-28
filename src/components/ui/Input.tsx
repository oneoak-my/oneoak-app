import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  prefix?: string
}

export default function Input({ label, error, prefix, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[#a89d84]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-[#7c6f54] font-medium pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040]',
            'focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors',
            prefix && 'pl-9',
            error && 'border-red-500/50',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, error, options, placeholder, className, id, ...props }: SelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[#a89d84]">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={cn(
          'w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8]',
          'focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors',
          'appearance-none cursor-pointer',
          error && 'border-red-500/50',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" className="bg-[#1e1a14] text-[#7c6f54]">
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1e1a14] text-[#f5f0e8]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[#a89d84]">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={3}
        className={cn(
          'w-full rounded-xl border border-[#332c20] bg-[#262018] px-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#5c5040] resize-none',
          'focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/20 transition-colors',
          error && 'border-red-500/50',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
