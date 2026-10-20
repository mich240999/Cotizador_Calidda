/**
 * Ordena el catálogo de materiales para que la lista desplegable muestre
 * primero los que mejor se ajustan a la cotización: proveedor/empresa
 * seleccionado y descripción/detalles del pedido.
 */

export type MaterialCatalogo = {
  id: string;
  codigo?: string | null;
  codigo_sap?: string | null;
  codigo_tmp?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  espacio_remodelar?: string | null;
  id_proveedor?: string | number | null;
  proveedor_nombre?: string | null;
  precio_vigente?: number | null;
  precio_unit?: number | null;
};

export type CriterioMateriales = {
  texto?: string;
  codigos?: string[];
  proveedorId?: string;
  proveedorNombre?: string;
};

const PALABRAS_VACIAS = new Set([
  "para", "con", "por", "del", "las", "los", "una", "uno", "unos", "unas",
  "que", "como", "mas", "sin", "sobre", "entre", "desde", "hasta", "este",
  "esta", "estos", "estas", "sus", "material", "materiales", "producto",
  "servicio", "instalacion", "incluye", "cliente", "pedido", "cotizacion",
]);

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function normalizarMaterial(texto: unknown): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Raíz simple para que "puertas" coincida con "puerta". */
function raiz(token: string): string {
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

export function tokensMaterial(texto: unknown): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const bruto of normalizarMaterial(texto).split(" ")) {
    if (bruto.length < 3 || PALABRAS_VACIAS.has(bruto)) continue;
    const token = raiz(bruto);
    if (vistos.has(token)) continue;
    vistos.add(token);
    salida.push(token);
  }
  return salida;
}

export const codigoMaterial = (m: MaterialCatalogo): string =>
  String(m.codigo ?? m.codigo_sap ?? m.codigo_tmp ?? "");

export const precioMaterial = (m: MaterialCatalogo): number =>
  Number(m.precio_vigente ?? m.precio_unit ?? 0);

function textoMaterial(m: MaterialCatalogo): string {
  return normalizarMaterial(
    [codigoMaterial(m), m.nombre, m.descripcion, m.espacio_remodelar, m.proveedor_nombre]
      .filter(Boolean)
      .join(" ")
  );
}

export function puntajeMaterial(m: MaterialCatalogo, criterio: CriterioMateriales): number {
  let puntaje = 0;

  const idProveedor = String(criterio.proveedorId ?? "").trim();
  const proveedorBuscado = normalizarMaterial(criterio.proveedorNombre);
  const proveedorMaterial = normalizarMaterial(m.proveedor_nombre);

  if (idProveedor && m.id_proveedor != null && String(m.id_proveedor) === idProveedor) {
    puntaje += 60;
  } else if (
    proveedorBuscado &&
    proveedorMaterial &&
    (proveedorMaterial === proveedorBuscado ||
      proveedorMaterial.includes(proveedorBuscado) ||
      proveedorBuscado.includes(proveedorMaterial))
  ) {
    puntaje += 45;
  }

  const consulta = normalizarMaterial(criterio.texto);
  const texto = textoMaterial(m);
  if (consulta.length > 4 && texto.includes(consulta)) puntaje += 30;

  const buscados = tokensMaterial(criterio.texto);
  if (buscados.length > 0) {
    const enNombre = tokensMaterial(`${m.nombre ?? ""} ${m.espacio_remodelar ?? ""}`);
    const enDescripcion = tokensMaterial(m.descripcion);
    const enCodigo = tokensMaterial(codigoMaterial(m));
    let coincidencias = 0;
    for (const token of buscados) {
      if (enNombre.includes(token)) {
        puntaje += 10;
        coincidencias++;
      } else if (enDescripcion.includes(token)) {
        puntaje += 5;
        coincidencias++;
      } else if (enCodigo.includes(token)) {
        puntaje += 2;
        coincidencias++;
      }
    }
    if (coincidencias >= 2) puntaje += 15;
  }

  const codigos = (criterio.codigos ?? []).map(normalizarMaterial).filter(Boolean);
  if (codigos.length > 0 && codigos.includes(normalizarMaterial(codigoMaterial(m)))) {
    puntaje += 100;
  }

  return puntaje;
}

export type MaterialesOrdenados<T extends MaterialCatalogo> = {
  ordenados: T[];
  sugeridos: T[];
  resto: T[];
};

/**
 * Devuelve el catálogo ordenado por afinidad. `sugeridos` incluye solo los que
 * tienen alguna coincidencia (proveedor, código o texto) y `resto` el resto,
 * para mostrarlos en grupos dentro del <select>.
 */
export function ordenarMateriales<T extends MaterialCatalogo>(
  materiales: T[],
  criterio: CriterioMateriales
): MaterialesOrdenados<T> {
  const conPuntaje = materiales.map((material, indice) => ({
    material,
    indice,
    puntaje: puntajeMaterial(material, criterio),
    precio: precioMaterial(material),
  }));

  conPuntaje.sort((a, b) => {
    if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
    const precioA = a.precio > 0 ? 1 : 0;
    const precioB = b.precio > 0 ? 1 : 0;
    if (precioB !== precioA) return precioB - precioA;
    return (
      String(a.material.nombre ?? "").localeCompare(String(b.material.nombre ?? ""), "es") ||
      a.indice - b.indice
    );
  });

  return {
    ordenados: conPuntaje.map((x) => x.material),
    sugeridos: conPuntaje.filter((x) => x.puntaje > 0).map((x) => x.material),
    resto: conPuntaje.filter((x) => x.puntaje === 0).map((x) => x.material),
  };
}
