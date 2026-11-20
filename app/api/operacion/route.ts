import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import { ejecutarOperacionSegura, OPERACIONES } from "@/lib/operaciones";
import { ejecutarOperacionSeguraSGT, OPERACIONES_SGT } from "@/lib/operacionesSGT";
import { ejecutarOperacionSeguraVentas, OPERACIONES_VENTAS } from "@/lib/operacionesVentas";
import { cargarMatrizOperaciones, construirCatalogoMatriz, guardarMatrizOperaciones } from "@/lib/permisosMatriz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EsquemaBody = z.object({
  operacion: z.string().trim().min(1).max(80),
  argumentos: z.unknown().optional().default({}),
  modulo: z.string().trim().max(80).optional().default("")
});

/**
 * Replica de `google.script.run`:
 *   POST /api/operacion { operacion, argumentos, modulo }
 *
 * Flujo:
 *   1. Valida sesión Supabase (cookies) + dominio permitido.
 *   2. Despacha a lib/operaciones + lib/operacionesSGT (whitelist + rol + zod).
 *       Whitelist = operaciones base ∪ OPERACIONES_SGT
 *       (listarProveedoresSGT, crearProveedorSGT, listarOficinasVentas,
 *       vincularProveedorOficina, listarGruposVendedores, listarAsignaciones,
 *       listarRolesSGT, getMatrizPermisos, listarMaterialesSGT, crearTarifa,
 *       cargaMasivaTarifas, simularFinanciamiento, crearCotizacionSGT,
 *       regenerarPDF). Se intenta primero el mapa base y, si la operación es
 *       desconocida (404), se reintenta en el mapa SGT — sin romper lo existente.
 *   3. Escribe audit_log y actualiza sesiones_app.ultima_actividad.
 */
export async function POST(req: Request) {
  const service = createSupabaseServiceRole();
  let body: z.infer<typeof EsquemaBody>;
  try {
    body = EsquemaBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Body inválido: { operacion, argumentos, modulo }" }, { status: 400 });
  }

  const sesion = await getSession();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const { operacion, argumentos, modulo } = body;

  try {
    let datos: unknown;
    if (operacion === "getMatrizPermisos") {
      if (sesion.rol !== "admin") throw Object.assign(new Error("Solo administración puede consultar la matriz"), { status: 403 });
      const catalogo = construirCatalogoMatriz([
        ...Object.entries(OPERACIONES), ...Object.entries(OPERACIONES_SGT), ...Object.entries(OPERACIONES_VENTAS),
      ]);
      datos = { fuente: "permisos por operación", ...(await cargarMatrizOperaciones(service, catalogo)) };
    } else if (operacion === "guardarMatrizPermisos") {
      if (sesion.rol !== "admin") throw Object.assign(new Error("Solo administración puede modificar la matriz"), { status: 403 });
      const catalogo = construirCatalogoMatriz([
        ...Object.entries(OPERACIONES), ...Object.entries(OPERACIONES_SGT), ...Object.entries(OPERACIONES_VENTAS),
      ]);
      const validacion = z.array(z.object({ rol_codigo: z.string().trim().min(1).max(30), recurso: z.string().trim().min(1).max(120), permitido: z.coerce.boolean() })).min(1).max(2000).safeParse((argumentos as { cambios?: unknown } | null)?.cambios);
      if (!validacion.success) throw Object.assign(new Error(`Cambios inválidos: ${validacion.error.issues.map((i) => i.message).join("; ")}`), { status: 400 });
      datos = await guardarMatrizOperaciones(service, catalogo, validacion.data);
    } else try {
      ({ datos } = await ejecutarOperacionSegura(operacion, argumentos ?? {}, {
        service,
        sesion,
        modulo
      }));
    } catch (e) {
      const err = e as Error & { status?: number };
      // Solo cae a los mapas SGT/Ventas si la op. no existe en el base (404) y sí en ellos.
      if (err.status === 404 && (OPERACIONES_SGT as Record<string, unknown>)[operacion]) {
        ({ datos } = await ejecutarOperacionSeguraSGT(operacion, argumentos ?? {}, {
          service,
          sesion,
          modulo
        }));
      } else if (err.status === 404 && (OPERACIONES_VENTAS as Record<string, unknown>)[operacion]) {
        ({ datos } = await ejecutarOperacionSeguraVentas(operacion, argumentos ?? {}, {
          service,
          sesion,
          modulo
        }));
      } else {
        throw e;
      }
    }

    // Auditoría + heartbeat (best-effort, no rompen la respuesta)
    // audit_log(schema.sql): user_id, operacion, argumentos, modulo
    await Promise.allSettled([
      service.from("audit_log").insert({
        user_id: sesion.userId,
        operacion,
        modulo: modulo || null,
        argumentos: (argumentos ?? {}) as object
      }),
      service
        .from("sesiones_app")
        .update({ ultima_actividad: new Date().toISOString() })
        .eq("user_id", sesion.userId)
        .eq("activa", true)
    ]);

    return NextResponse.json({ ok: true, datos });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;

    await service
      .from("audit_log")
      .insert({
        user_id: sesion.userId,
        operacion,
        modulo: modulo || null,
        argumentos: { ...(argumentos as object ?? {}), _error: err.message?.slice(0, 500) ?? "Error" }
      })
      .then(
        () => undefined,
        () => undefined
      );

    return NextResponse.json({ ok: false, error: err.message || "Error interno" }, { status });
  }
}
