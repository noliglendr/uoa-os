import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Geist, stored in the project (latin subset, all weights in one file) so the
// app never has to download fonts from Google: no start-up failure on a bad
// connection, and no third-party request when staff open the app.
// Geist is free to use under the SIL Open Font License 1.1 (by Vercel).
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UOA OS",
  description: "Matter tracking for UOA Legal",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
