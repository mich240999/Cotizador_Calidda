import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolUsuario, SesionInfo } from "./auth";

export type RecursoMatriz = {
  key: string;
  modulo: string;
  grupo: string;
  nombre: string;
  roles: RolUsuario[];
};

export const recursoOperacion = (operacion: string) => `OP_${operacion}`;

const FIJOS_ADMIN = new Set([
  "adminListarUsuarios", "adminCrearUsuario", "adminActualizarUsuario", "adminEliminarUsuario",
  "adminListar", "adminCrear", "adminActualizar", "adminEliminar",
  "getMatrizPermisos", "guardarMatrizPermisos", "listarRolesSGT", "crearRolSGT", "actualizarRolSGT",
  "listarAuditoria", "cfgSesionesListar", "cfgSesionesGuardar", "cerrarSesionActiva",
  "crearUsuarioSGT", "actualizarUsuarioSGT", "cambiarPasswordUsuario",
]);

export function esRecursoSoloAdmin(recurso: string): boolean {
  return FIJOS_ADMIN.has(recurso.replace(/^OP_/, ""));
}

export function codigoRolMatriz(sesion: SesionInfo): string {
  if (sesion.rolCodigo) return sesion.rolCodigo.toUpperCase();
  if (sesion.rol === "admin") return "ADMIN";
  return sesion.rol === "oficina" ? "SUPERVISOR" : "ASESOR";
}

export function moduloOperacion(key: string): string {
  if (/^(admin|crearProveedor|actualizarProveedor|listarProveedoresSGT|cargaMasivaProveedores|listarOficinas|crearOficina|actualizarOficina|vincularProveedor|actualizarVinculacion|crearGrupo|actualizarGrupo|listarGrupos|cargaMasivaAsesores|listarAsignaciones|crearAsignacion|actualizarAsignacion|listarUsuarios|crearUsuario|actualizarUsuario|listarRoles|crearRol|actualizarRol|listarAuditoria|cfg|cerrarSesion|cambiarPassword|actualizarRecurso|listarRecursosVisuales|getMatriz|guardarMatriz)/i.test(key)) return "ADMINISTRACION";
  if (/Cliente/i.test(key)) return "CLIENTES";
  if (/Material|Tarifa/i.test(key)) return "MATERIALES";
  if (/Cotizacion|Cotizacion|Financiamiento|generarPDF|regenerarPDF/i.test(key)) return "COTIZACIONES";
  if (/Venta|Abono|PV|Instalacion|Evidencia|Liquidacion|Solicitud|CotizacionesParaVenta|exportarVentas/i.test(key)) return "VENTAS_E_INSTALACIONES";
  return "GENERAL";
}

export function construirCatalogoMatriz(registros: [string, { descripcion: string; roles: RolUsuario[] }][]): RecursoMatriz[] {
  return registros.map(([key, def]) => ({
    key: recursoOperacion(key),
    modulo: moduloOperacion(key),
    grupo: key.startsWith("admin") || key.includes("Usuario") ? "USUARIOS Y ROLES" : moduloOperacion(key),
    nombre: def.descripcion,
    roles: def.roles,
  }));
}

function errorHttp(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** La matriz puede restringir y, en recursos operativos, ampliar el rol base.
 * Las acciones de seguridad/administración de roles permanecen solo admin. */
export async function verificarPermisoMatriz(
  service: SupabaseClient,
  sesion: SesionInfo,
  operacion: string,
  rolesBase: RolUsuario[],
): Promise<void> {
  if (sesion.rol === "admin") return; // evita bloquear el acceso administrador
  const recurso = recursoOperacion(operacion);
  if (esRecursoSoloAdmin(recurso) || (rolesBase.length === 1 && !rolesBase.includes(sesion.rol))) {
    if (!rolesBase.includes(sesion.rol)) throw errorHttp(`Acción reservada a administración: ${operacion}`, 403);
    return;
  }
  let permitido = rolesBase.includes(sesion.rol);
  const rolCodigo = codigoRolMatriz(sesion);
  const { data, error } = await service.from("seg_permisos_matriz").select("permitido")
    .eq("rol_codigo", rolCodigo).eq("recurso", recurso).maybeSingle();
  if (error) {
    if (/does not exist|Could not find the table|42P01/i.test(error.message)) {
      if (!permitido) throw errorHttp(`Rol '${sesion.rol}' sin permiso para '${operacion}'`, 403);
      return;
    }
    throw new Error(`No se pudo validar el permiso de ${operacion}: ${error.message}`);
  }
  if (data) permitido = Boolean(data.permitido);
  if (!permitido) throw errorHttp(`Rol '${rolCodigo}' sin permiso para '${operacion}'`, 403);
}

export async function cargarMatrizOperaciones(
  service: SupabaseClient,
  catalogo: RecursoMatriz[],
): Promise<{ roles: string[]; modulos: { modulo: string; grupos: { grupo: string; recursos: { recurso: string; nombre: string; permitido: Record<string, boolean>; fijoAdmin: boolean }[] }[] }[]; concedidos: number; total: number }> {
  const [{ data: rolesData, error: rolesError }, { data: existentes, error: rowsError }] = await Promise.all([
    service.from("seg_roles").select("codigo").order("codigo"),
    service.from("seg_permisos_matriz").select("rol_codigo,recurso,permitido").like("recurso", "OP_%"),
  ]);
  if (rolesError) throw new Error(rolesError.message);
  if (rowsError) throw new Error(rowsError.message);
  const roles = ((rolesData ?? []) as { codigo: string }[]).map((r) => r.codigo);
  const guardados = new Map(((existentes ?? []) as { rol_codigo: string; recurso: string; permitido: boolean }[])
    .map((r) => [`${r.rol_codigo}|${r.recurso}`, Boolean(r.permitido)]));
  const nuevas = catalogo.flatMap((item) => roles.filter((rol) => !guardados.has(`${rol}|${item.key}`)).map((rol) => {
    const rolApp: RolUsuario | null = ["ADMIN", "SUPERADMIN"].includes(rol) ? "admin"
      : rol === "SUPERVISOR" ? "oficina"
        : ["ASESOR", "PROVEEDOR"].includes(rol) ? "asesor" : null;
    return { rol_codigo: rol, modulo: item.modulo, grupo: item.grupo, recurso: item.key, nombre: item.nombre, permitido: !!rolApp && item.roles.includes(rolApp) };
  }));
  if (nuevas.length) {
    const { error } = await service.from("seg_permisos_matriz").upsert(nuevas, { onConflict: "rol_codigo,recurso", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    for (const row of nuevas) guardados.set(`${row.rol_codigo}|${row.recurso}`, row.permitido);
  }
  const agrupados = new Map<string, Map<string, { recurso: string; nombre: string; permitido: Record<string, boolean>; fijoAdmin: boolean }[]>>();
  let concedidos = 0;
  for (const item of catalogo) {
    if (!agrupados.has(item.modulo)) agrupados.set(item.modulo, new Map());
    const grupos = agrupados.get(item.modulo)!;
    if (!grupos.has(item.grupo)) grupos.set(item.grupo, []);
    const permitido = Object.fromEntries(roles.map((rol) => [rol, guardados.get(`${rol}|${item.key}`) ?? false]));
    concedidos += Object.values(permitido).filter(Boolean).length;
    grupos.get(item.grupo)!.push({ recurso: item.key, nombre: item.nombre, permitido, fijoAdmin: esRecursoSoloAdmin(item.key) || item.roles.length === 1 });
  }
  return { roles, modulos: [...agrupados.entries()].map(([modulo, grupos]) => ({ modulo, grupos: [...grupos.entries()].map(([grupo, recursos]) => ({ grupo, recursos })) })), concedidos, total: catalogo.length * roles.length };
}

export async function guardarMatrizOperaciones(
  service: SupabaseClient,
  catalogo: RecursoMatriz[],
  cambios: { rol_codigo: string; recurso: string; permitido: boolean }[],
) {
  cambios = [...new Map(cambios.map((c) => [`${c.rol_codigo}|${c.recurso}`, c])).values()];
  const catalogoMap = new Map(catalogo.map((r) => [r.key, r]));
  const rolesUsados = [...new Set(cambios.map((c) => c.rol_codigo))];
  const { data: rolesData, error: rolesError } = await service.from("seg_roles").select("codigo").in("codigo", rolesUsados);
  if (rolesError) throw new Error(rolesError.message);
  const rolesValidos = new Set(((rolesData ?? []) as { codigo: string }[]).map((r) => r.codigo));
  const filas = cambios.map((c) => {
    const item = catalogoMap.get(c.recurso);
    if (!item || !rolesValidos.has(c.rol_codigo)) throw errorHttp(`Rol o recurso desconocido: ${c.rol_codigo} / ${c.recurso}`, 422);
    if (["ADMIN", "SUPERADMIN"].includes(c.rol_codigo) && !c.permitido) throw errorHttp("No se puede retirar al administrador el acceso total", 422);
    if ((esRecursoSoloAdmin(c.recurso) || item.roles.length === 1) && c.rol_codigo !== "ADMIN" && c.permitido) throw errorHttp("Este recurso solo puede habilitarse para ADMIN", 422);
    return { rol_codigo: c.rol_codigo, modulo: item.modulo, grupo: item.grupo, recurso: item.key, nombre: item.nombre, permitido: c.permitido };
  });
  const { error } = await service.from("seg_permisos_matriz").upsert(filas, { onConflict: "rol_codigo,recurso" });
  if (error) throw new Error(error.message);
  return { guardados: filas.length };
}
