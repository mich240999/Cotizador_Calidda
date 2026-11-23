import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Plataforma AMCA - Cálidda",
    short_name: "Plataforma AMCA - Cálidda",
    description: "Plataforma AMCA de Cálidda para gestionar cotizaciones, ventas, proveedores e instalaciones.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#F4F7FA",
    theme_color: "#0077B6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
