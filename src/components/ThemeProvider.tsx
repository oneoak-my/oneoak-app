'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'dark' | 'warm'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function applyTheme(t: Theme) {
  if (t === 'warm') {
    document.documentElement.setAttribute('data-theme', 'warm')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('oneoak-theme')
      if (saved === 'warm') {
        setThemeState('warm')
        applyTheme('warm')
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    try { localStorage.setItem('oneoak-theme', t) } catch { /* noop */ }
    applyTheme(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
