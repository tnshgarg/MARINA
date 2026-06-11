import type { Metadata } from "next";
import "./globals.css";
import { NavProgress } from "@/components/nav-progress";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "MARINA · AI Chief of Staff for engineering-led teams",
  description:
    "The AI eyes and ears for your team — blockers, briefs, attendance, and live standups built for product startups.",
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
        {/*
          - Inter (body): variable weight + cv* alternates
          - Instrument Serif (display): editorial serif, free Google font that
            evokes Tiempos/Canela/Ivy without the licensing
          - VT323 / Press Start 2P kept for character avatars + agent terminal
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Press+Start+2P&family=VT323&display=swap"
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
