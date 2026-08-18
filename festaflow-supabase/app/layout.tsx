import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FestaFlow", description: "SaaS de festas e eventos com Supabase PostgreSQL" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
