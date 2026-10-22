const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const VERBOSO = process.env.PRUEBAS_VERBOSE === "1";
const PUERTO = Number(process.env.PRUEBAS_PORT || 3112);
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
    fallos.push("permisos: " + nombre + (extra ? " -> " + extra : ""));
    console.log("  FAIL  " + nombre + (extra ? " -> " + extra : ""));
  }
};

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

const filasDe = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);

async function ejecutar() {
  cargarEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    console.log("Permisos: omitido (faltan claves de Supabase)");
    return { pass: 0, fail: 0, fallos: [], omitido: true };
  }
  if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
    console.log("Permisos: omitido (sin build; ejecute npm run build)");
    return { pass: 0, fail: 0, fallos: [], omitido: true };
  }

  const { createClient } = require("@supabase/supabase-js");
  const { createServerClient } = require("@supabase/ssr");
  const service = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const dominios = String(process.env.AUTH_ALLOWED_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const dominio = dominios[0] ?? "example.com";
  const sufijo = Date.now().toString(36).toUpperCase();
  const cola = String(Date.now()).slice(-4);
  const marca = "PRUEBA PERM " + sufijo;

  const usuarios = {};
  const creados = { ventas: [], cotizaciones: [], seg: [], asignaciones: [], perfiles: [], auth: [], provs: [], clientes: [], maeClientes: [] };
  let servidor = null;
  let clienteLegacyId = null;

  try {
    const { data: roles } = await service.from("roles").select("id,nombre");
    const rolAdmin = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "admin");
    const rolAsesor = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "asesor");
    if (!rolAdmin || !rolAsesor) throw new Error("tabla roles sin admin/asesor");

    const crear = async (clave, rolSgt, idProveedor, nombre) => {
      const email = `perm.${clave.toLowerCase()}.${sufijo.toLowerCase()}@${dominio}`;
      const password = "Pm." + Math.random().toString(36).slice(2, 11) + "0Aa";
      const { data: au, error: eAu } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } });
      if (eAu) throw eAu;
      creados.auth.push(au.user.id);
      const esAdmin = rolSgt === "ADMIN";
      const { error: eP } = await service.from("profiles").insert({
        id: au.user.id, email, nombre, rol_id: esAdmin ? rolAdmin.id : rolAsesor.id, activo: true,
      });
      if (eP) throw eP;
      creados.perfiles.push(au.user.id);
      const segId = "U9" + cola.slice(-3) + String(creados.seg.length + 1);
      const { error: eS } = await service.from("seg_usuarios").insert({
        id: segId, nombre, tipo_doc: "DNI", nro_doc: "9" + cola.slice(-3) + String(creados.seg.length + 1), correo: email,
        rol_codigo: rolSgt, id_proveedor: idProveedor, estado: "ACTIVO",
      });
      if (eS) throw eS;
      creados.seg.push(segId);
      usuarios[clave] = { email, password, userId: au.user.id, segId, nombre };
    };

    // Proveedores A y B.
    const provA = "PRV9" + cola.slice(-2) + "1";
    const provB = "PRV9" + cola.slice(-2) + "2";
    const rucA = ("9" + String(Date.now()).slice(-7) + "000").slice(0, 11);
    const rucB = ("8" + String(Date.now()).slice(-7) + "000").slice(0, 11);
    for (const [id, ruc, nom] of [[provA, rucA, marca + " A"], [provB, rucB, marca + " B"]]) {
      const { error } = await service.from("mae_proveedores").insert({
        id, interlocutor: nom, ruc, razon_social: nom, nombre_comercial: nom, estado: "ACTIVO",
      });
      if (error) throw new Error("proveedor " + id + ": " + error.message);
      creados.provs.push(id);
    }

    await crear("admin", "ADMIN", null, marca + " Admin");
    await crear("provA", "PROVEEDOR", provA, marca + " Prov A");
    await crear("provB", "PROVEEDOR", provB, marca + " Prov B");
    await crear("sup", "SUPERVISOR", provA, marca + " Sup");
    await crear("as1", "ASESOR", provA, marca + " As1");
    await crear("as2", "ASESOR", provA, marca + " As2");
    await crear("asB", "ASESOR", provB, marca + " AsB");

    const { error: eAsg } = await service.from("seg_asignaciones_asesores").insert({
      id: "ASG9" + cola.slice(-3), id_asesor: usuarios.as1.segId, id_supervisor: usuarios.sup.segId,
      id_proveedor: provA, fecha_inicio: new Date().toISOString().slice(0, 10), estado: "VIGENTE",
    });
    if (eAsg) throw new Error("asignacion: " + eAsg.message);
    creados.asignaciones.push("ASG9" + cola.slice(-3));

    // Cliente legacy + maestro (para cotizaciones y ventas).
    const { data: cliLegacy, error: eCli } = await service.from("clientes").insert({
      nombres: marca, dni: "7" + cola, telefono: "999999999", email: null,
    }).select("id").single();
    if (eCli) throw new Error("cliente legacy: " + eCli.message);
    clienteLegacyId = cliLegacy.id;
    creados.clientes.push(cliLegacy.id);
    const cliMae = "CLI9" + cola;
    const { error: eCliM } = await service.from("mae_clientes").insert({
      id: cliMae, tipo_persona: "NATURAL", tipo_doc: "DNI", nro_doc: "6" + cola, nombre_razon_social: marca, estado: "ACTIVO",
    });
    if (eCliM) throw new Error("cliente mae: " + eCliM.message);
    creados.maeClientes.push(cliMae);

    // Cotizaciones: una por usuario (menos provB) + una de admin.
    const cotDefs = [
      ["C1", "as1", provA], ["C2", "as2", provA], ["C3", "asB", provB], ["C4", "sup", provA],
    ];
    for (const [clave, quien] of cotDefs) {
      const { data, error } = await service.from("cotizaciones").insert({
        codigo: "COT-PRUEBA-" + clave + "-" + sufijo,
        cliente_id: clienteLegacyId,
        estado: "BORRADOR",
        subtotal: 100, igv: 18, total: 118,
        observaciones: marca,
        created_by: usuarios[quien].userId,
        asesor: usuarios[quien].nombre,
        proveedor: clave === "C3" ? marca + " B" : marca + " A",
      }).select("id").single();
      if (error) throw new Error("cotizacion " + clave + ": " + error.message);
      creados.cotizaciones.push({ clave, id: data.id });
    }

    // Ventas: A/as1, A/as2, B/asB, A/sup (borrador) + A/as1, B/asB (generada).
    const ventaDefs = [
      ["V1", "as1", provA, "borrador"],
      ["V2", "as2", provA, "borrador"],
      ["V3", "asB", provB, "borrador"],
      ["V4", "sup", provA, "borrador"],
      ["V5", "as1", provA, "generada"],
      ["V6", "asB", provB, "generada"],
    ];
    for (const [clave, quien, prov, estado] of ventaDefs) {
      const id = "VTA-9" + cola.slice(-4) + clave.slice(-1);
      const { error } = await service.from("vta_solicitudes_venta").insert({
        id, id_cliente: cliMae, id_proveedor: prov, canal: "proveedor", pago_modo: "financiado_total",
        tea: 40, estado, observaciones: marca + " " + clave, created_by: usuarios[quien].userId,
        id_asesor: usuarios[quien].segId, asesor_nombre: usuarios[quien].nombre, ambiente: marca,
      });
      if (error) throw new Error("venta " + clave + ": " + error.message);
      creados.ventas.push({ clave, id, prov, estado, creador: quien });
    }
    const ventasClave = (clave) => creados.ventas.find((v) => v.clave === clave).id;
    const cotClave = (clave) => creados.cotizaciones.find((c) => c.clave === clave).id;

    // ------------------------------------------------ sesiones -> cookies
    for (const [clave, u] of Object.entries(usuarios)) {
      const jar = [];
      const cli = createServerClient(url, anon, {
        cookies: {
          getAll: () => jar.map((c) => ({ name: c.name, value: c.value })),
          setAll: (list) => {
            for (const { name, value } of list) {
              const i = jar.findIndex((c) => c.name === name);
              if (value === "") { if (i >= 0) jar.splice(i, 1); }
              else if (i >= 0) jar[i].value = value;
              else jar.push({ name, value });
            }
          },
        },
      });
      const { error } = await cli.auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw new Error("login " + clave + ": " + error.message);
      usuarios[clave].cookie = jar.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
    }

    const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
    servidor = spawn(process.execPath, [nextBin, "start", "-p", String(PUERTO)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    servidor.stdout.on("data", () => undefined);
    servidor.stderr.on("data", (d) => { if (VERBOSO) process.stderr.write(d); });
    aviso("servidor next start :" + PUERTO, await esperarServidor(90000));

    // Dashboard: solo admin. Proveedor vuelve a instalaciones; el resto a cotizaciones.
    const dashboard = async (clave) => {
      const res = await fetch(`${BASE}/dashboard`, { headers: { cookie: usuarios[clave].cookie }, redirect: "manual" });
      return { status: res.status, location: res.headers.get("location") || "" };
    };
    const rDashAdmin = await dashboard("admin");
    aviso("admin /dashboard -> 200", rDashAdmin.status === 200, `HTTP ${rDashAdmin.status} ${rDashAdmin.location}`);
    for (const [clave, destino] of [["provA", "/instalaciones"], ["sup", "/cotizaciones"], ["as1", "/cotizaciones"]]) {
      const r = await dashboard(clave);
      const redirige = [302, 303, 307, 308].includes(r.status) && r.location.includes(destino);
      aviso(`${clave} /dashboard -> ${destino}`, redirige, `HTTP ${r.status} ${r.location}`);
    }

    const op = async (clave, nombre, argumentos) => {
      const res = await fetch(BASE + "/api/operacion", {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json", cookie: usuarios[clave].cookie },
        body: JSON.stringify({ operacion: nombre, argumentos: argumentos ?? {}, modulo: "permisos" }),
      });
      const cuerpo = await res.json().catch(() => null);
      return { status: res.status, cuerpo };
    };

    // Clientes: el asesor solo consulta; crear/editar/importar es de admin/oficina.
    const rCli = await op("as1", "listarClientesSGT", { limit: 1, page: 1, pageSize: 1 });
    aviso("as1 listarClientesSGT (consulta) -> 200", rCli.status === 200, `HTTP ${rCli.status}`);
    for (const nombre of ["crearClienteSGT", "actualizarClienteSGT", "validarArchivoClientes", "cargaMasivaClientes", "crearCliente"]) {
      const r = await op("as1", nombre, {});
      aviso(`as1 ${nombre} -> 403`, r.status === 403, `HTTP ${r.status}`);
    }

    const idsVentas = (datos) => filasDe(datos).map((r) => String(r.id)).filter((id) => id.startsWith("VTA-9"));
    const idsCots = (datos) => filasDe(datos).map((r) => String(r.id)).filter((id) => creados.cotizaciones.some((c) => c.id === id));

    // Matriz esperada.
    const esperado = {
      admin: { ventas: ["V1", "V2", "V3", "V4", "V5", "V6"], cots: ["C1", "C2", "C3", "C4"], inst: ["V5", "V6"] },
      provA: { ventas: ["V1", "V2", "V4", "V5"], cots: ["C1", "C2", "C4"], inst: ["V5"] },
      provB: { ventas: ["V3", "V6"], cots: ["C3"], inst: ["V6"] },
      sup: { ventas: ["V1", "V4", "V5"], cots: ["C1", "C4"], inst: ["V5"] },
      as1: { ventas: ["V1", "V5"], cots: ["C1"], inst: ["V5"] },
      as2: { ventas: ["V2"], cots: ["C2"], inst: [] },
      asB: { ventas: ["V3", "V6"], cots: ["C3"], inst: ["V6"] },
    };
    const setDe = (claves, fn) => new Set(claves.map((k) => fn(k)));
    const iguales = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
    const fmt = (s) => [...s].sort().join(",") || "-";

    for (const clave of Object.keys(esperado)) {
      const exp = esperado[clave];

      const rV = await op(clave, "listarVentas", { limit: 100, page: 1, pageSize: 100 });
      const gotV = new Set(idsVentas(rV.cuerpo?.datos));
      const expV = setDe(exp.ventas, ventasClave);
      aviso(`${clave} listarVentas ve ${fmt(expV)}`, rV.status === 200 && iguales(gotV, expV), `HTTP ${rV.status} ve ${fmt(gotV)}`);

      const rE = await op(clave, "exportarVentas", {});
      const filasE = rE.cuerpo?.datos?.filas ?? filasDe(rE.cuerpo?.datos);
      const gotE = new Set(filasE.map((f) => String(f[0])).filter((id) => id.startsWith("VTA-9")));
      aviso(`${clave} exportarVentas ve ${fmt(expV)}`, rE.status === 200 && iguales(gotE, expV), `HTTP ${rE.status} ve ${fmt(gotE)}`);

      const rC = await op(clave, "listarCotizaciones", { limit: 200 });
      const gotC = new Set(idsCots(rC.cuerpo?.datos));
      const expC = setDe(exp.cots, cotClave);
      aviso(`${clave} listarCotizaciones ve ${fmt(expC)}`, rC.status === 200 && iguales(gotC, expC), `HTTP ${rC.status} ve ${fmt(gotC)}`);

      const rB = await op(clave, "buscarCotizacionesParaVenta", { limit: 200 });
      const gotB = new Set(idsCots(rB.cuerpo?.datos));
      aviso(`${clave} buscarCotizacionesParaVenta ve ${fmt(expC)}`, rB.status === 200 && iguales(gotB, expC), `HTTP ${rB.status} ve ${fmt(gotB)}`);

      const rI = await op(clave, "listarInstalaciones", { limit: 100, page: 1, pageSize: 100 });
      const gotI = new Set(idsVentas(rI.cuerpo?.datos));
      const expI = setDe(exp.inst, ventasClave);
      aviso(`${clave} listarInstalaciones ve ${fmt(expI)}`, rI.status === 200 && iguales(gotI, expI), `HTTP ${rI.status} ve ${fmt(gotI)}`);
    }

    // getVenta: solo las visibles de cada uno.
    for (const clave of Object.keys(esperado)) {
      const visibles = new Set(esperado[clave].ventas);
      for (const v of creados.ventas) {
        const r = await op(clave, "getVenta", { id: v.id });
        const debe = visibles.has(v.clave);
        aviso(`${clave} getVenta ${v.clave} -> ${debe ? "200" : "403"}`, debe ? r.status === 200 : r.status === 403, `HTTP ${r.status}`);
      }
    }

    // PDF: solo visible para admin, dueño, proveedor y supervisor del equipo.
    const pdfDe = async (clave, cotId) => {
      const res = await fetch(`${BASE}/api/cotizaciones/${cotId}/pdf`, { headers: { cookie: usuarios[clave].cookie }, redirect: "manual" });
      return res.status;
    };
    const pdfEsperado = {
      admin: { C1: 200 }, provA: { C1: 200 }, provB: { C1: 403 }, sup: { C1: 200 }, as1: { C1: 200 }, as2: { C1: 403 }, asB: { C1: 403 },
    };
    for (const [clave, casos] of Object.entries(pdfEsperado)) {
      for (const [cot, status] of Object.entries(casos)) {
        const got = await pdfDe(clave, cotClave(cot));
        aviso(`${clave} pdf ${cot} -> ${status}`, got === status, `HTTP ${got}`);
      }
    }
  } catch (e) {
    aviso("ejecucion de permisos sin excepciones", false, e && e.message ? e.message : String(e));
  } finally {
    try {
      if (servidor) { servidor.kill(); await dormir(700); }
      const idsV = creados.ventas.map((v) => v.id);
      if (idsV.length) {
        for (const tabla of ["vta_venta_items", "vta_abonos", "vta_instalaciones"]) await service.from(tabla).delete().in("solicitud_id", idsV);
        await service.from("vta_solicitudes_venta").delete().in("id", idsV);
      }
      const idsC = creados.cotizaciones.map((c) => c.id);
      if (idsC.length) {
        await service.from("cotizacion_items").delete().in("cotizacion_id", idsC);
        await service.from("cotizaciones").delete().in("id", idsC);
      }
      if (creados.clientes.length) await service.from("clientes").delete().in("id", creados.clientes);
      if (creados.maeClientes.length) await service.from("mae_clientes").delete().in("id", creados.maeClientes);
      if (creados.asignaciones.length) await service.from("seg_asignaciones_asesores").delete().in("id", creados.asignaciones);
      if (creados.seg.length) await service.from("seg_usuarios").delete().in("id", creados.seg);
      if (creados.perfiles.length) {
        await service.from("sesiones_app").delete().in("user_id", creados.perfiles);
        await service.from("audit_log").delete().in("user_id", creados.perfiles);
        await service.from("profiles").delete().in("id", creados.perfiles);
      }
      for (const id of creados.auth) await service.auth.admin.deleteUser(id);
      if (creados.provs.length) await service.from("mae_proveedores").delete().in("id", creados.provs);
      const { data: resto } = await service.from("seg_usuarios").select("id").in("id", creados.seg.length ? creados.seg : ["-"]);
      aviso("limpieza de datos de permisos", (resto ?? []).length === 0, `${(resto ?? []).length} fichas seg restantes`);
    } catch (e) {
      aviso("limpieza sin errores", false, e && e.message ? e.message : String(e));
    }
  }

  return { pass, fail, fallos, omitido: false };
}

module.exports = { ejecutar };

if (require.main === module) {
  (async () => {
    console.log("Permisos por rol (datos temporales de 2 proveedores)...");
    const r = await ejecutar();
    console.log("\nPERMISOS: " + r.pass + " pass, " + r.fail + " fail");
    if (r.fallos.length) r.fallos.forEach((f) => console.log(" - " + f));
    process.exit(r.fail ? 1 : 0);
  })();
}
