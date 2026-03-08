import "@/styles/global.css"
import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { LocaleProvider } from "@/lib/i18n"
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: "MindPocket",
  description: "Your personal knowledge management assistant",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LocaleProvider>
            {children}
            <Toaster />
          </LocaleProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
