import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavProgress } from "@/components/nav-progress";
import { ToastProvider } from "@/components/toast";
import { TestModeBadge } from "@/components/test-mode-badge";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://marina.team";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MARINA · AI Chief of Staff for remote teams",
    template: "%s · MARINA",
  },
  description:
    "MARINA is the AI chief of staff for remote engineering teams. Auto-detected blockers, a 4-minute morning brief, async standups, attendance and recognition — clarity and control without becoming the bottleneck. Free for your first 5 teammates.",
  applicationName: "MARINA",
  keywords: [
    "AI chief of staff",
    "remote team management software",
    "engineering management tool",
    "async standup tool",
    "blocker tracking",
    "team productivity",
    "manager dashboard",
    "Slack standup bot",
    "remote work software",
    "developer activity tracking",
  ],
  authors: [{ name: "Project MARINA" }],
  creator: "Project MARINA",
  publisher: "Project MARINA Private Limited",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "MARINA",
    url: SITE_URL,
    title: "MARINA · The AI Chief of Staff for remote teams",
    description:
      "See your team without chasing people. Auto-detected blockers, a 4-minute morning brief, and async standups — clarity, alignment and control without becoming the bottleneck.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MARINA · The AI Chief of Staff for remote teams",
    description:
      "See your team without chasing people. Blockers, briefs and standups — without becoming the bottleneck.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  icons: {
    // Favicon/tab + apple-touch use the rounded-square "M" monogram tile
    // (/icon.svg). The circle mark (/logo.svg) is the same monogram for inline
    // lockups. SVG scales perfectly across every device pixel ratio.
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

// Without this, mobile browsers fall back to a 980px virtual viewport — our
// `max-width: 900px` media query never matches and the mobile-nav hamburger
// never appears. Setting `width=device-width` is the single most important
// line for mobile responsiveness across the product.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3f6b54",
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
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
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
        <TestModeBadge />
      </body>
    </html>
  );
}
