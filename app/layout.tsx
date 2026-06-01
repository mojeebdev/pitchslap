import type { Metadata } from "next";
import { EB_Garamond, DM_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pitchslap.vercel.app"),
  title: "PitchSlap",
  description: "Paste your startup idea. Get brutally honest feedback from an AI seed-stage VC. No sugarcoating — just the roast and the fix.",
  icons: [
    { rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' },
    { rel: 'icon', url: '/icon', sizes: '32x32' }, // PNG fallback
  ],
  openGraph: {
    title: "PitchSlap",
    description: "Brutally honest seed-stage feedback. No sugarcoating.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "PitchSlap - Brutally honest pitch feedback",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PitchSlap",
    description: "Brutally honest seed-stage feedback. No sugarcoating.",
    images: ["/og-image.jpg"],
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
      className={`${ebGaramond.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0A0908] text-[#f0ebe4]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
