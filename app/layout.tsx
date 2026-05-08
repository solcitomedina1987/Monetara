import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Monetara | Gestión de Finanzas Personales",
  description: "Controlá tus finanzas personales de forma simple, visual y eficiente. Registrá ingresos, egresos, gestioná cuentas y generá reportes.",
  openGraph: {
    title: "Monetara | Gestión de Finanzas Personales",
    description: "Controlá tus finanzas personales de forma simple, visual y eficiente.",
    siteName: "Monetara",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Monetara | Gestión de Finanzas Personales",
    description: "Controlá tus finanzas personales de forma simple, visual y eficiente.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
