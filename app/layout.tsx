import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plataforma AMCA - Cálidda",
  applicationName: "Plataforma AMCA - Cálidda",
  description: "Plataforma AMCA de Cálidda para gestionar cotizaciones, ventas, proveedores e instalaciones.",
  icons: { icon: "/logo-calidda.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Plataforma AMCA - Cálidda",
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
