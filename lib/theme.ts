export type ThemeName = "light" | "dark" | "liquid-light" | "liquid-dark";

export const THEMES: { id: ThemeName; label: string; description: string; dark: boolean; liquid: boolean }[] = [
  { id: "light", label: "Original claro", description: "La apariencia actual de la plataforma.", dark: false, liquid: false },
  { id: "dark", label: "Oscuro", description: "La apariencia oscura actual.", dark: true, liquid: false },
  { id: "liquid-light", label: "Liquid glass claro", description: "Paneles translúcidos, desenfoque y fondo luminoso.", dark: false, liquid: true },
  { id: "liquid-dark", label: "Liquid glass oscuro", description: "Cristal translúcido sobre una paleta nocturna.", dark: true, liquid: true },
];

export function normalizarTema(value: unknown): ThemeName {
  return THEMES.some((tema) => tema.id === value) ? value as ThemeName : "light";
}

export function leerTema(): ThemeName {
  try {
    const guardado = localStorage.getItem("sh-theme");
    // Compatibilidad con las preferencias anteriores.
    return normalizarTema(guardado === "true" ? "dark" : guardado);
  } catch {
    return "light";
  }
}

export function aplicarTema(value: unknown): ThemeName {
  const tema = normalizarTema(value);
  const definicion = THEMES.find((item) => item.id === tema)!;
  const root = document.documentElement;
  root.classList.toggle("dark", definicion.dark);
  root.classList.toggle("liquid-glass", definicion.liquid);
  root.classList.toggle("liquid-glass-dark", tema === "liquid-dark");
  const colorBarra = tema === "dark" ? "#020617"
    : tema === "liquid-dark" ? "#0b172a"
      : tema === "liquid-light" ? "#eaf5ff" : "#f4f7fa";
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = colorBarra;
  try {
    localStorage.setItem("sh-theme", tema);
  } catch { /* preferencias opcionales */ }
  window.dispatchEvent(new CustomEvent<ThemeName>("amca-theme-change", { detail: tema }));
  return tema;
}
