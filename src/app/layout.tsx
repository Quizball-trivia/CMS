import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/providers";
import { TableDerbyRoot } from "@/providers/table-derby-root";
import { WORKSPACE } from "@/lib/workspace";
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
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased`}
      >
        {WORKSPACE === "table-derby" ? (
          <TableDerbyRoot>{children}</TableDerbyRoot>
        ) : (
          <Providers>{children}</Providers>
        )}
      </body>
    </html>
  );
}
