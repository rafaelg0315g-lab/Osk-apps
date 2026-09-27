import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { AuthDialog } from "@/components/pro/auth-dialog";
import { SiteFooter } from "@/components/home/site-footer";
import { SiteHeader } from "@/components/home/site-header";
import { DonateWidget } from "@/components/shared/donate-widget";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://osk-apps.vercel.app",
  ),
  title: {
    default: "OSK APPS — Todas las herramientas online en un solo lugar",
    template: "%s | OSK APPS",
  },
  description:
    "La navaja suiza de herramientas online: PDF, imágenes, facturas, QR, acortador de links, calculadoras y más. Gratis, rápido y sin registro.",
  keywords: [
    "herramientas online",
    "combinar pdf",
    "comprimir imagen",
    "generador de QR",
    "acortador de links",
    "generador de facturas",
    "contador de palabras",
    "base64",
    "json formatter",
    "conversor de unidades",
    "gratis",
  ],
  authors: [{ name: "OSK APPS" }],
  // Verificación de Google Search Console (token de googleebcb657f6294f8f2.html)
  verification: {
    google: "ebcb657f6294f8f2",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "OSK APPS — Todas las herramientas online en un solo lugar",
    description:
      "PDF, imágenes, facturas, QR, links, calculadoras y más. Gratis, rápido y sin registro.",
    url: "/",
    siteName: "OSK APPS",
    type: "website",
    locale: "es",
  },
  twitter: {
    card: "summary_large_image",
    title: "OSK APPS",
    description: "La navaja suiza de herramientas online. Gratis y sin registro.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
              <DonateWidget />
              <AuthDialog />
            </div>
            <Toaster position="top-center" richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
