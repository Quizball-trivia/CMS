import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/providers";
import { WORKSPACE } from "@/lib/workspace";
import { LINK_FRAGMENT_SCRIPT } from "@/lib/td/link-fragment";
import { TD_LANG } from "@/lib/td/i18n";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata =
  WORKSPACE === "table-derby"
    ? { title: "Table Derby CMS", robots: { index: false, follow: false } }
    : {
        title: "QuizBall CMS",
        description: "Content management system for QuizBall",
      };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={WORKSPACE === "table-derby" ? TD_LANG : "en"}>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased`}
      >
        {/* Before hydration, so the router never sees a one-time link token in the URL (src/lib/td/link-fragment.ts). */}
        {WORKSPACE === "table-derby" && (
          <Script id="td-link-fragment" strategy="beforeInteractive">
            {LINK_FRAGMENT_SCRIPT}
          </Script>
        )}
        {/* Chosen per build, not per path: a Table Derby build never mounts Quizball auth, not even on 404s. */}
        {WORKSPACE === "table-derby" ? children : <Providers>{children}</Providers>}
      </body>
    </html>
  );
}
