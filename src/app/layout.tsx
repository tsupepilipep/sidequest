import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SideQuest — Sidewalk Quality Rating",
  description: "Rate the quality of sidewalks in Sofia, Bulgaria",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="m-0 overflow-hidden p-0">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
