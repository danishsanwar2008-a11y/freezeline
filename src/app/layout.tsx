import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AgentationDev from "@/components/AgentationDev";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = { themeColor: "#0b1016", colorScheme: "dark" };

export const metadata: Metadata = {
  title: "FreezeLine",
  description:
    "House-by-house freeze risk and coordinated drip plans for water utilities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {process.env.NODE_ENV === "development" && <AgentationDev />}
      </body>
    </html>
  );
}
