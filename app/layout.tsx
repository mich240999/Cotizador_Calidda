import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cálidda | Ambientes Cáliddos — Gestión comercial y financiamiento",
  description: "Plataforma comercial Ambientes Cáliddos: clientes, cotizaciones, materiales y administración.",
  icons: { icon: "/logo-calidda.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cáliddos",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0077B6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#F4F7FA]">{children}</body>
    </html>
  );
}
