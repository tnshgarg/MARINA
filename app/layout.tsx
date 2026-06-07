import type { Metadata } from "next";
import "./globals.css";
import { NavProgress } from "@/components/nav-progress";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "Project MARINA",
  description: "AI Workforce Intelligence — track meaningful work, suit up your team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NavProgress />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
