import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNavigation } from "@/components/layout/app-navigation";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <AppNavigation />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
