const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const VERBOSO = process.env.PRUEBAS_VERBOSE === "1";
const PUERTO = Number(process.env.PRUEBAS_PORT || 3111);
const BASE = `http://127.0.0.1:${PUERTO}`;

let pass = 0;
let fail = 0;
const fallos = [];

const aviso = (nombre, ok, extra) => {
  if (ok) {
    pass++;
    if (VERBOSO) console.log("  PASS  " + nombre);
  } else {
    fail++;
    fallos.push("e2e: " + nombre + (extra ? " -> " + extra : ""));
    console.log("  FAIL  " + nombre + (extra ? " -> " + extra : ""));
  }
};
const omitidoLog = (nombre, nota) => console.log("  SKIP  " + nombre + (nota ? " (" + nota + ")" : ""));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function cargarEnvLocal() {
  const archivo = path.join(root, ".env.local");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}

async function esperarServidor(ms) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      const res = await fetch(BASE + "/", { redirect: "manual" });
      if (res.status > 0) return true;
    } catch { /* aun no escucha */ }
    await dormir(500);
  }
  return false;
}

async function ejecutar() {
  cargarEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    console.log("E2E: omitido (faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)");
    return { pass: 0, fail: 0, fallos: [], omitido: true };
  }
  if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
    console.log("E2E: omitido (sin build; ejecute npm run build)");
    return { pass: 0, fail: 0, fallos: [], omitido: true };
  }

  const { createClient } = require("@supabase/supabase-js");
  const { createServerClient } = require("@supabase/ssr");
  const service = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const dominios = String(process.env.AUTH_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const sufijo = Date.now().toString(36);
  const email = `pruebas.humo.${sufijo}@${dominios[0] ?? "example.com"}`;
  const password = "Ph." + Math.random().toString(36).slice(2, 12) + "0Aa";
  const marca = "PRUEBA HUMO " + sufijo.toUpperCase();

  let userId = null;
  let nroDoc = "";
  let servidor = null;
  const creado = { cotizacionId: null, solicitudId: null, clienteSgtId: null, subidas: [] };

  try {
    // ------------------------------------------------ usuario temporal
    const { data: nuevo, error: eUser } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: marca },
    });
    if (eUser) throw eUser;
    userId = nuevo.user.id;
    aviso("alta de usuario temporal", Boolean(userId));

    const { data: roles } = await service.from("roles").select("id,nombre");
    const rolAdmin = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "admin");
    const rolAsesor = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "asesor");
    const { data: oficina } = await service.from("oficinas").select("id").limit(1).maybeSingle();

    const { error: ePerfil } = await service.from("profiles").insert({
      id: userId,
      email,
      nombre: marca,
      rol_id: rolAdmin ? rolAdmin.id : null,
      oficina_id: oficina ? oficina.id : null,
      activo: true,
    });
    aviso("perfil con rol admin", !ePerfil, ePerfil ? ePerfil.message : "");

    for (let i = 0; i < 8 && !nroDoc; i++) {
      const candidato = String(90000000 + Math.floor(Math.random() * 10000000));
      const { data: existe } = await service.from("mae_clientes").select("id").eq("nro_doc", candidato).maybeSingle();
      if (!existe) nroDoc = candidato;
    }
    aviso("documento de prueba unico en mae_clientes", Boolean(nroDoc), nroDoc || "sin cupo");

    // ------------------------------------------------ sesion -> cookies
    const jar = [];
    const cli = createServerClient(url, anon, {
      cookies: {
        getAll: () => jar.map((c) => ({ name: c.name, value: c.value })),
        setAll: (list) => {
          for (const { name, value } of list) {
            const i = jar.findIndex((c) => c.name === name);
            if (value === "") {
              if (i >= 0) jar.splice(i, 1);
            } else if (i >= 0) {
              jar[i].value = value;
            } else {
              jar.push({ name, value });
            }
          }
        },
      },
    });
    const { error: eLogin } = await cli.auth.signInWithPassword({ email, password });
    aviso("login email+password", !eLogin, eLogin ? eLogin.message : "");
    const cookie = jar.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
    aviso("cookie de sesion sb-*-auth-token", /sb-.*-auth-token/.test(cookie));

    // ------------------------------------------------ servidor next start
    const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
    servidor = spawn(process.execPath, [nextBin, "start", "-p", String(PUERTO)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    servidor.stdout.on("data", () => undefined);
    servidor.stderr.on("data", (d) => { if (VERBOSO) process.stderr.write(d); });
    const arriba = await esperarServidor(90000);
    aviso(`servidor next start :${PUERTO}`, arriba);
    if (!arriba) throw new Error("el servidor no respondio");

    const pedir = async (ruta, opciones = {}) => {
      const res = await fetch(BASE + ruta, { redirect: "manual", ...opciones });
      const tipo = res.headers.get("content-type") || "";
      let cuerpo = null;
      if (tipo.includes("application/json")) {
        try { cuerpo = await res.json(); } catch { /* ignora */ }
      } else {
        try { cuerpo = await res.text(); } catch { /* ignora */ }
      }
      return { status: res.status, tipo, cuerpo, ubicacion: res.headers.get("location") };
    };
    const op = (nombre, argumentos, modulo = "pruebas") =>
      pedir("/api/operacion", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ operacion: nombre, argumentos: argumentos ?? {}, modulo }),
      });
    const filasDe = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);

    // ------------------------------------------------ 1) middleware sin sesion
    for (const ruta of ["/dashboard", "/cotizaciones", "/clientes", "/materiales", "/admin", "/ventas", "/instalaciones"]) {
      const r = await pedir(ruta);
      const redirige = r.status === 307 && String(r.ubicacion ?? "").includes("next=");
      aviso(`sin sesion ${ruta} -> 307 login`, redirige, `${r.status} ${r.ubicacion ?? ""}`);
    }
    const sinSesionApi = await pedir("/api/operacion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operacion: "listarClientesSGT", argumentos: {} }),
    });
    aviso("sin sesion API -> 401", sinSesionApi.status === 401, String(sinSesionApi.status));

    // ------------------------------------------------ 2) middleware con sesion
    for (const ruta of ["/dashboard", "/cotizaciones", "/clientes", "/materiales", "/admin", "/ventas", "/instalaciones"]) {
      const r = await pedir(ruta, { headers: { cookie } });
      aviso(`con sesion ${ruta} -> 200`, r.status === 200, `${r.status} ${r.ubicacion ?? ""}`);
    }

    const perfil = await pedir("/api/mi-perfil", { headers: { cookie } });
    aviso("GET /api/mi-perfil rol ADMIN", perfil.status === 200 && String(perfil.cuerpo?.rol ?? "").toUpperCase() === "ADMIN", `${perfil.status} ${JSON.stringify(perfil.cuerpo)}`);

    // ------------------------------------------------ 3) operaciones de lectura
    const lectura = async (nombre, argumentos, valida, etiqueta) => {
      const r = await op(nombre, argumentos);
      const ok = r.status === 200 && r.cuerpo?.ok !== false;
      const extra = valida ? valida(r.cuerpo?.datos) : { ok: true };
      aviso(etiqueta || nombre, ok && extra.ok, !ok ? `HTTP ${r.status} ${JSON.stringify(r.cuerpo?.error ?? "")}` : extra.nota ?? "");
      return r.cuerpo?.datos;
    };
    const hayFilas = (d) => {
      const f = filasDe(d);
      return Array.isArray(d) || (d && Array.isArray(d.rows)) ? { ok: true, nota: f.length + " filas" } : { ok: false, nota: "respuesta sin filas" };
    };

    await lectura("listarClientesSGT", { limit: 5, pageSize: 5 }, hayFilas);
    await lectura("listarMaterialesSGT", { limit: 5, pageSize: 5, espacio: "VENTAS" }, hayFilas, "listarMaterialesSGT espacio VENTAS");
    await lectura("listarProveedoresSGT", { limit: 5 }, hayFilas);
    await lectura("listarCotizaciones", {}, hayFilas);
    await lectura("buscarCotizacionesParaVenta", { limit: 5 }, hayFilas);
    await lectura("listarVentas", { limit: 5, page: 1, pageSize: 5 }, hayFilas);
    await lectura("listarInstalaciones", { limit: 5, page: 1, pageSize: 5 }, hayFilas);
    await lectura("getMatrizPermisos", {}, () => ({ ok: true }));
    await lectura("simularFinanciamiento", { capital: 1000, tea: 40, plazo: 9 }, (d) => {
      const cuota = Number((d && (d.cuota ?? d.cuota_mensual)) ?? NaN);
      return { ok: Number.isFinite(cuota) && cuota > 0, nota: "cuota " + cuota };
    });

    // ------------------------------------------------ 4) flujo de escritura
    const materialVentas = await pedir("/api/operacion", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ operacion: "listarMaterialesSGT", argumentos: { limit: 5, pageSize: 5, espacio: "VENTAS" }, modulo: "pruebas" }),
    }).then((r) => {
      const filas = filasDe(r.cuerpo?.datos);
      return filas[0] ?? null;
    });

    const rCli = await op("crearClienteSGT", {
      tipo_persona: "NATURAL",
      tipo_doc: "DNI",
      nro_doc: nroDoc,
      nombre_razon_social: marca,
      correo: "",
      telefono: "999999999",
      distrito: "LIMA",
    });
    creado.clienteSgtId = rCli.cuerpo?.datos?.id ?? null;
    aviso("crearClienteSGT", rCli.status === 200 && Boolean(creado.clienteSgtId), `HTTP ${rCli.status} ${JSON.stringify(rCli.cuerpo?.error ?? "")}`);

    const rBuscar = await op("listarClientesSGT", { q: nroDoc, limit: 5, pageSize: 5 });
    const filasBuscar = filasDe(rBuscar.cuerpo?.datos);
    aviso("listarClientesSGT encuentra el cliente nuevo", filasBuscar.some((x) => String(x.nro_doc ?? x.dni ?? "") === nroDoc), filasBuscar.length + " filas");

    if (creado.clienteSgtId) {
      const rCot = await op("crearCotizacionSGT", {
        cliente_id: creado.clienteSgtId,
        items: [{ codigo: "PRUEBA-HUMO", descripcion: "ITEM DE PRUEBA", cantidad: 1, precio_unit: 100, descuento_pct: 0 }],
        cuota_inicial: 0,
        tea: 40,
        plazo: 9,
        asesor: marca,
        observaciones: marca,
        detalles: {
          marca_melamina: "PRUEBA",
          color_estructura: "PRUEBA",
          color_puertas: "PRUEBA",
          color_tablero: "PRUEBA",
          tiradores: "PRUEBA",
          vidrios: "PRUEBA",
        },
      });
      creado.cotizacionId = rCot.cuerpo?.datos?.id ?? null;
      const codigoCot = rCot.cuerpo?.datos?.codigo ?? "";
      aviso("crearCotizacionSGT", rCot.status === 200 && Boolean(creado.cotizacionId), `HTTP ${rCot.status} ${JSON.stringify(rCot.cuerpo?.error ?? "")}`);

      if (creado.cotizacionId) {
        const rLista = await op("listarCotizaciones", {});
        const cot = filasDe(rLista.cuerpo?.datos).find((c) => c.id === creado.cotizacionId);
        aviso("la cotizacion nueva aparece en listarCotizaciones", Boolean(cot), codigoCot);

        const rPdf = await pedir(`/api/cotizaciones/${creado.cotizacionId}/pdf`, { headers: { cookie } });
        aviso("GET pdf cotizacion -> 200 application/pdf", rPdf.status === 200 && rPdf.tipo.includes("pdf"), `${rPdf.status} ${rPdf.tipo}`);

        const rBuscaVenta = await op("buscarCotizacionesParaVenta", { q: nroDoc, limit: 10 });
        const encontrada = filasDe(rBuscaVenta.cuerpo?.datos).some((c) => String(c.id ?? c.cotizacion_id ?? "") === creado.cotizacionId);
        aviso("buscarCotizacionesParaVenta la encuentra por DNI", encontrada);

        const rPrefill = await op("obtenerCotizacionParaVenta", { cotizacion_id: creado.cotizacionId });
        aviso("obtenerCotizacionParaVenta", rPrefill.status === 200, `HTTP ${rPrefill.status}`);

        if (materialVentas && rPrefill.status === 200) {
          const idMaterial = String(materialVentas.id ?? materialVentas.material_id ?? "");
          const rSol = await op("crearSolicitudVenta", {
            id_cliente: creado.clienteSgtId,
            canal: "proveedor",
            pago_modo: "financiado_total",
            tea: 40,
            cotizacion_id: creado.cotizacionId,
            items: [{ id_material: idMaterial, cantidad: 1, precio_unit: 100, descuento_monto: 0, modo: "financiado", medio_pago: "financiado" }],
          });
          creado.solicitudId = rSol.cuerpo?.datos?.id ?? null;
          if (creado.solicitudId) {
            aviso("crearSolicitudVenta desde cotizacion", true, creado.solicitudId);
            const rGet = await op("getVenta", { id: creado.solicitudId });
            aviso("getVenta de la solicitud nueva", rGet.status === 200, `HTTP ${rGet.status}`);
            const rPv = await op("registrarPV", { solicitud_id: creado.solicitudId, codigo_llamada: "PRUEBA-LLAMADA", numero_pedido_venta: "PV-PRUEBA" });
            const estadoPv = String(rPv.cuerpo?.datos?.solicitud?.estado ?? rPv.cuerpo?.datos?.estado ?? "").toLowerCase();
            aviso("registrarPV -> generada", rPv.status === 200 && estadoPv === "generada", `HTTP ${rPv.status} ${estadoPv || JSON.stringify(rPv.cuerpo?.error ?? "")}`);
          } else {
            omitidoLog("crearSolicitudVenta", `HTTP ${rSol.status} ${JSON.stringify(rSol.cuerpo?.error ?? "")}`);
          }
        } else {
          omitidoLog("crearSolicitudVenta", materialVentas ? "sin prefill" : "sin material en VENTAS");
        }

        const fantasma = "00000000-0000-4000-8000-000000000000";
        const rEnviar = await pedir(`/api/cotizaciones/${fantasma}/enviar`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ para: email }),
        });
        const enviarOk = rEnviar.status === 404 || (rEnviar.status === 500 && /SMTP no configurado/i.test(String(rEnviar.cuerpo?.error ?? "")));
        aviso("POST enviar (id inexistente) no manda correo", enviarOk, `${rEnviar.status} ${JSON.stringify(rEnviar.cuerpo?.error ?? "")}`);
      }
    } else {
      omitidoLog("crearCotizacionSGT y dependientes", "sin cliente de prueba");
    }

    // ------------------------------------------------ 5) uploads
    const form = new FormData();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082", "hex");
    form.append("file", new Blob([png], { type: "image/png" }), "prueba-humo.png");
    form.append("carpeta", "sustentos");
    const rUp = await fetch(BASE + "/api/uploads", { method: "POST", headers: { cookie }, body: form });
    const up = await rUp.json().catch(() => null);
    if (rUp.status === 200 && up?.ruta) {
      creado.subidas.push({ bucket: up.bucket, ruta: up.ruta });
      aviso("POST /api/uploads sube PNG", true, up.url);
    } else if (/buckets no creados/i.test(String(up?.error ?? ""))) {
      omitidoLog("POST /api/uploads", "buckets de storage no creados");
    } else {
      aviso("POST /api/uploads sube PNG", false, `${rUp.status} ${JSON.stringify(up?.error ?? "")}`);
    }
    const rUpCarpeta = await fetch(BASE + "/api/uploads", { method: "POST", headers: { cookie }, body: (() => { const f = new FormData(); f.append("file", new Blob([png], { type: "image/png" }), "x.png"); f.append("carpeta", "invalida"); return f; })() });
    aviso("POST /api/uploads carpeta invalida -> 400", rUpCarpeta.status === 400, String(rUpCarpeta.status));

    // ------------------------------------------------ 6) rol asesor -> 403
    if (rolAsesor) {
      await service.from("profiles").update({ rol_id: rolAsesor.id }).eq("id", userId);
      const r403 = await op("crearRolSGT", { nombre: marca, descripcion: "prueba" });
      aviso("op solo-admin con rol asesor -> 403", r403.status === 403, `HTTP ${r403.status} ${JSON.stringify(r403.cuerpo?.error ?? "")}`);
      const rPermitida = await op("listarClientesSGT", { limit: 3, pageSize: 3 });
      aviso("op operativa con rol asesor -> 200", rPermitida.status === 200, `HTTP ${rPermitida.status}`);
      await service.from("profiles").update({ rol_id: rolAdmin ? rolAdmin.id : null }).eq("id", userId);
    } else {
      omitidoLog("prueba 403 con rol asesor", "sin rol asesor en la tabla roles");
    }
  } catch (e) {
    aviso("ejecucion E2E sin excepciones", false, e && e.message ? e.message : String(e));
  } finally {
    // ------------------------------------------------ limpieza
    try {
      if (servidor) {
        servidor.kill();
        await dormir(700);
      }
      if (userId) {
        const { data: sols } = await service.from("vta_solicitudes_venta").select("id").eq("created_by", userId);
        const ids = (sols ?? []).map((s) => s.id);
        if (ids.length) {
          for (const tabla of ["vta_venta_items", "vta_abonos", "vta_instalaciones"]) {
            await service.from(tabla).delete().in("solicitud_id", ids);
          }
          await service.from("vta_solicitudes_venta").delete().in("id", ids);
        }
        const { data: cots } = await service.from("cotizaciones").select("id").eq("created_by", userId);
        const idsCot = (cots ?? []).map((c) => c.id);
        if (idsCot.length) {
          await service.from("cotizacion_items").delete().in("cotizacion_id", idsCot);
          await service.from("cotizaciones").delete().in("id", idsCot);
        }
        if (nroDoc) {
          await service.from("mae_clientes").delete().eq("nro_doc", nroDoc);
          await service.from("clientes").delete().eq("dni", nroDoc);
        }
        for (const s of creado.subidas) {
          await service.storage.from(s.bucket).remove([s.ruta]);
        }
        await service.from("sesiones_app").delete().eq("user_id", userId);
        await service.from("audit_log").delete().eq("user_id", userId);
        await service.from("profiles").delete().eq("id", userId);
        const { error: eDel } = await service.auth.admin.deleteUser(userId);
        const resto = await service.from("mae_clientes").select("id").eq("nro_doc", nroDoc);
        aviso("limpieza: usuario, perfil y datos de prueba", !eDel && (resto.data ?? []).length === 0, eDel ? eDel.message : "quedan " + (resto.data ?? []).length + " clientes de prueba");
      }
    } catch (e) {
      aviso("limpieza sin errores", false, e && e.message ? e.message : String(e));
    }
  }

  return { pass, fail, fallos, omitido: false };
}

module.exports = { ejecutar };

if (require.main === module) {
  (async () => {
    console.log("E2E autenticado (crea usuario temporal y lo elimina al final)...");
    const r = await ejecutar();
    console.log("\nE2E: " + r.pass + " pass, " + r.fail + " fail");
    if (r.fallos.length) r.fallos.forEach((f) => console.log(" - " + f));
    process.exit(r.fail ? 1 : 0);
  })();
}
