import type { Config } from 'tailwindcss'

// Makes gold-* utilities read from CSS variable channels so the whole palette
// switches atomically when [data-theme="pastel"] is set on <html>.
// Cast to string because Tailwind's TS types don't model color functions,
// even though the runtime fully supports them.
function withOpacity(variable: string): string {
  return (({
    opacityValue,
    opacityVariable,
  }: {
    opacityValue?: string
    opacityVariable?: string
  }) => {
    if (opacityValue !== undefined) return `rgb(var(${variable}) / ${opacityValue})`
    if (opacityVariable !== undefined) return `rgb(var(${variable}) / var(${opacityVariable}, 1))`
    return `rgb(var(${variable}))`
  }) as unknown as string
}

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: withOpacity('--gold-300-ch'),
          400: withOpacity('--gold-400-ch'),
          500: withOpacity('--gold-500-ch'),
          600: withOpacity('--gold-600-ch'),
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        surface: {
          DEFAULT: '#141210',
          card: '#1e1a14',
          elevated: '#262018',
          border: '#332c20',
          hover: '#2e2719',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
