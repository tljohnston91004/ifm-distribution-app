import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IFM — Inventory Funding Manager (Distribution)",
  description:
    "Decide how much inventory can be responsibly funded now, and which purchase candidates to fund, reduce, delay, split, hold, or decline.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
