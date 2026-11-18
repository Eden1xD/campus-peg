import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PEG — Progressão Estudantil Gremista",
  description: "Plataforma PEG e o protótipo isolado PEG — Minha Escola.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
