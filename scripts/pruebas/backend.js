const path = require("path");

const base = process.env.PRUEBAS_BUILD || path.join(process.cwd(), ".pruebas-build");
const VERBOSO = process.env.PRUEBAS_VERBOSE === "1";

let pass = 0;
let fail = 0;
const fallos = [];

const aviso = (nombre, cond, extra) => {
  if (cond) {
    pass++;
    if (VERBOSO) console.log("  PASS  " + nombre);
  } else {
    fail++;
    fallos.push("backend: " + nombre + (extra ? " -> " + extra : ""));
    console.log("  FAIL  " + nombre + (extra ? " -> " + extra : ""));
  }
};

const filas = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : null);

async function ejecutar() {
  const tienenCredenciales = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!tienenCredenciales) {
    console.log("Backend: omitido (faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    return { pass: 0, fail: 0, fallos: [], omitido: true };
  }

  const { OPERACIONES_SGT, ejecutarOperacionSeguraSGT } = require(path.join(base, "operacionesSGT.js"));
  const { OPERACIONES_VENTAS, ejecutarOperacionSeguraVentas } = require(path.join(base, "operacionesVentas.js"));
  const { OPERACIONES, ejecutarOperacionSegura } = require(path.join(base, "operaciones.js"));
  const { createClient } = require("@supabase/supabase-js");

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sesion = { userId: "pruebas-humo", email: "pruebas@local", rol: "admin", alcance: "GLOBAL" };
  const ctx = { service, sesion, modulo: "pruebas" };

  const op = async (label, nombre, ejecutarSegura, args, valida) => {
    try {
      const { datos } = await ejecutarSegura(nombre, args, ctx);
      const r = valida ? valida(datos) : { ok: true };
      aviso(label, r.ok, r.ok ? "" : r.nota);
    } catch (e) {
      aviso(label, false, (e.status ? e.status + " " : "") + e.message);
    }
  };
  const esperaError = async (label, nombre, ejecutarSegura, args, status) => {
    try {
      await ejecutarSegura(nombre, args, ctx);
      aviso(label, false, "se esperaba error " + status);
    } catch (e) {
      aviso(label, e.status === status, e.status === status ? "" : "status " + e.status + " != " + status);
    }
  };
  const conFilas = (d) => {
    const f = filas(d);
    return f ? { ok: true } : { ok: false, nota: "respuesta sin rows" };
  };

  aviso(`registro base=${Object.keys(OPERACIONES).length} sgt=${Object.keys(OPERACIONES_SGT).length} ventas=${Object.keys(OPERACIONES_VENTAS).length}`, Object.keys(OPERACIONES).length > 0);

  await esperaError("listarClientesSGT rechaza pageSize 500", "listarClientesSGT", ejecutarOperacionSeguraSGT, { limit: 500, pageSize: 500 }, 400);
  await esperaError("operacion desconocida -> 404", "noExiste123", ejecutarOperacionSeguraSGT, {}, 404);
  await esperaError("limit fuera de rango -> 400", "listarClientesSGT", ejecutarOperacionSeguraSGT, { limit: 99999 }, 400);
  try {
    await ejecutarOperacionSeguraSGT("actualizarAsignacion", {}, { service, sesion: { ...sesion, rol: "asesor" }, modulo: "pruebas" });
    aviso("rol asesor en op solo-admin -> 403", false, "no lanzo error");
  } catch (e) {
    aviso("rol asesor en op solo-admin -> 403", e.status === 403, e.status === 403 ? "" : (e.status || "") + " " + e.message);
  }

  await op("listarClientesSGT pageSize 100", "listarClientesSGT", ejecutarOperacionSeguraSGT, { limit: 500, pageSize: 100 }, conFilas);
  await op("listarClientesSGT sin q", "listarClientesSGT", ejecutarOperacionSeguraSGT, { limit: 5, pageSize: 5 }, conFilas);
  let unDoc = "";
  await op("listarClientesSGT toma muestra", "listarClientesSGT", ejecutarOperacionSeguraSGT, { limit: 1, pageSize: 1 }, (d) => {
    const f = filas(d);
    if (!f) return { ok: false, nota: "sin rows" };
    if (f[0]) unDoc = String(f[0].nro_doc ?? f[0].dni ?? "");
    return { ok: true };
  });
  if (unDoc) {
    await op(`listarClientesSGT q=${unDoc} filtra`, "listarClientesSGT", ejecutarOperacionSeguraSGT, { q: unDoc, limit: 20, pageSize: 20 }, (d) => {
      const f = filas(d);
      if (!f) return { ok: false, nota: "sin rows" };
      const coincide = f.every((r) => JSON.stringify(r).includes(unDoc));
      return { ok: f.length >= 1 && coincide, nota: f.length + " filas" };
    });
  } else {
    console.log("  SKIP  listarClientesSGT q (BD sin clientes)");
  }
  await op("listarClientesSGT q con coma no rompe", "listarClientesSGT", ejecutarOperacionSeguraSGT, { q: "Perez, Juan", limit: 5, pageSize: 5 }, conFilas);
  await op("listarClientesSGT q con parentesis no rompe", "listarClientesSGT", ejecutarOperacionSeguraSGT, { q: "Juan (test)", limit: 5, pageSize: 5 }, conFilas);

  await op("listarProveedoresSGT", "listarProveedoresSGT", ejecutarOperacionSeguraSGT, { limit: 200 }, conFilas);
  await op("listarMaterialesSGT COTIZACION", "listarMaterialesSGT", ejecutarOperacionSeguraSGT, { limit: 200, espacio: "COTIZACION" }, conFilas);
  await op("listarMaterialesSGT VENTAS", "listarMaterialesSGT", ejecutarOperacionSeguraSGT, { limit: 200, espacio: "VENTAS" }, conFilas);
  await op("listarUsuariosSGT", "listarUsuariosSGT", ejecutarOperacionSeguraSGT, {}, conFilas);
  await op("listarOficinasVentas", "listarOficinasVentas", ejecutarOperacionSeguraSGT, {}, conFilas);
  await op("listarRolesSGT", "listarRolesSGT", ejecutarOperacionSeguraSGT, {}, conFilas);
  await op("getMatrizPermisos", "getMatrizPermisos", ejecutarOperacionSeguraSGT, {}, () => ({ ok: true }));
  await op("listarGruposVendedores", "listarGruposVendedores", ejecutarOperacionSeguraSGT, {}, conFilas);
  await op("listarAsignaciones", "listarAsignaciones", ejecutarOperacionSeguraSGT, {}, conFilas);

  await op("listarVentas", "listarVentas", ejecutarOperacionSeguraVentas, { limit: 5, page: 1, pageSize: 5 }, conFilas);
  await op("listarVentas estado borrador", "listarVentas", ejecutarOperacionSeguraVentas, { estado: "borrador", limit: 5, page: 1, pageSize: 5 }, conFilas);
  await op("buscarCotizacionesParaVenta sin filtro", "buscarCotizacionesParaVenta", ejecutarOperacionSeguraVentas, { limit: 20 }, conFilas);
  await op("buscarCotizacionesParaVenta estado BORRADOR", "buscarCotizacionesParaVenta", ejecutarOperacionSeguraVentas, { estado: "BORRADOR", limit: 20 }, conFilas);
  await op("buscarCotizacionesParaVenta q=COT", "buscarCotizacionesParaVenta", ejecutarOperacionSeguraVentas, { q: "COT", limit: 10 }, conFilas);
  await op("buscarCotizacionesParaVenta rango fechas", "buscarCotizacionesParaVenta", ejecutarOperacionSeguraVentas, { desde: "2025-01-01", hasta: "2027-12-31", limit: 10 }, conFilas);
  await op("listarInstalaciones", "listarInstalaciones", ejecutarOperacionSeguraVentas, { limit: 5, page: 1, pageSize: 5 }, conFilas);

  await op("listarCotizaciones", "listarCotizaciones", ejecutarOperacionSegura, {}, conFilas);
  await op("listarMateriales", "listarMateriales", ejecutarOperacionSegura, { limit: 50 }, conFilas);
  await op("listarClientes legacy", "listarClientes", ejecutarOperacionSegura, { limit: 50 }, conFilas);
  await op("listarProveedores", "listarProveedores", ejecutarOperacionSegura, {}, conFilas);

  return { pass, fail, fallos, omitido: false };
}

module.exports = { ejecutar };
