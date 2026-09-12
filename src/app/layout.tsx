import type { Metadata } from 'next'
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import { Geist } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Naano — B2B LinkedIn Creator Marketplace',
  description: 'Find the creators your buyers already trust.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={geist.className}>
        <body className="min-h-screen flex flex-col">
          <header className="flex items-center justify-between px-8 py-4 bg-white/60 backdrop-blur-md sticky top-0 z-50 border-b border-black/5">
            <Link href="/" className="text-xl font-bold text-gray-900">naano</Link>
            <nav className="hidden md:flex items-center gap-8 text-sm text-gray-600">
              <Link href="/" className="hover:text-black transition-colors">For companies</Link>
              <Link href="/creators" className="hover:text-black transition-colors">For creators</Link>
              <Link href="/agencies" className="hover:text-black transition-colors">For agencies</Link>
              <Link href="#how-it-works" className="hover:text-black transition-colors">How it works</Link>
            </nav>
            <div className="flex items-center gap-3">
              <Show when="signed-out">
                <SignInButton>
                  <button className="text-gray-600 hover:text-gray-800 transition-colors">Sign in</button>
                </SignInButton>
                <SignUpButton>
                  <button className="bg-black/90 hover:bg-black rounded-full px-4 py-2 text-white text-sm">
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}