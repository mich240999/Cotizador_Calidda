import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cálidda | Soluciones Hogar — Gestión comercial y financiamiento",
  description: "Plataforma comercial Soluciones Hogar: clientes, cotizaciones, materiales y administración.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#F4F7FA]">{children}</body>
    </html>
  );
}
