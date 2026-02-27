import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'mendix-to-node',
  description: 'Generate a runnable Node.js/Express/Prisma app from any Mendix project',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
