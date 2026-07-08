import type { Metadata, Viewport } from "next";
import { AppNavigation } from "@/components/layout/app-navigation";
import { PageTransition } from "@/components/layout/page-transition";
import { TimeZoneSync } from "@/components/layout/time-zone-sync";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#d9531e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "FireTogether",
  description: "Couples' finance and expense tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FireTogether",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <div className="flex flex-1 flex-row">
          <AppNavigation />
          <main className="relative min-w-0 flex-1 pb-20 md:pb-0">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <Toaster position="top-center" richColors />
        <TimeZoneSync />
      </body>
    </html>
  );
}
