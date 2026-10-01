import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cálidda | Ambientes Cálidos — Gestión comercial y financiamiento",
  description: "Plataforma comercial Ambientes Cálidos: clientes, cotizaciones, materiales y administración.",
  icons: { icon: "/logo-calidda.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#F4F7FA]">{children}</body>
    </html>
  );
}
