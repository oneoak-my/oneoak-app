import type { Metadata, Viewport } from 'next'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'One Oak | Property Management',
  description: 'One Oak Property Management System',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'One Oak',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#141210',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apply saved theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('oneoak-theme')==='warm')document.documentElement.setAttribute('data-theme','warm')}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-[#141210] text-[#f5f0e8] antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
