import type { Metadata } from "next";
import { Albert_Sans, Bricolage_Grotesque, DM_Mono } from "next/font/google";
import { Ambient } from "@/components/explain/Ambient";
import { TopNav } from "@/components/explain/TopNav";
import "./globals.css";
import "./explain.css";

const sans = Albert_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["300", "400", "600", "700"], variable: "--font-bricolage" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "AI-Repo-Assistant",
  description: "Paste any public GitHub repo and get a plain-English explanation: what it does, its tech stack, the work done, and a preview of its output.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <Ambient />
        <TopNav />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
