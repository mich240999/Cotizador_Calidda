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
  const creados = {
    ventas: [], cotizaciones: [], seg: [], asignaciones: [], perfiles: [], auth: [], provs: [],
    oficinas: [], vinculos: [], grupos: [], clientes: [], maeClientes: []
  };
  let servidor = null;
  let clienteLegacyId = null;

  try {
    const { data: roles } = await service.from("roles").select("id,nombre");
    const rolAdmin = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "admin");
    const rolAsesor = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "asesor");
    const rolOficina = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "oficina");
    if (!rolAdmin || !rolAsesor) throw new Error("tabla roles sin admin/asesor");

    const crear = async (clave, rolSgt, idProveedor, nombre) => {
      const email = `perm.${clave.toLowerCase()}.${sufijo.toLowerCase()}@${dominio}`;
      const password = "Pm." + Math.random().toString(36).slice(2, 11) + "0Aa";
      const { data: au, error: eAu } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } });
      if (eAu) throw eAu;
      creados.auth.push(au.user.id);
      const esAdmin = rolSgt === "ADMIN";
      const esOficina = rolSgt === "OFICINA";
      const nombrePerfil = "Perfil " + nombre;
      const { error: eP } = await service.from("profiles").insert({
        id: au.user.id, email, nombre: nombrePerfil, rol_id: esAdmin ? rolAdmin.id : esOficina && rolOficina ? rolOficina.id : rolAsesor.id, activo: true,
      });
      if (eP) throw eP;
      creados.perfiles.push(au.user.id);
      const segId = "U9" + cola.slice(-3) + String(creados.seg.length + 1);
      const { error: eS } = await service.from("seg_usuarios").insert({
        id: segId, nombre, tipo_doc: "DNI", nro_doc: "9" + cola.slice(-3) + String(creados.seg.length + 1), correo: email,
        rol_codigo: esOficina ? "ASESOR" : rolSgt, id_proveedor: idProveedor, estado: "ACTIVO",
      });
      if (eS) throw eS;
      creados.seg.push(segId);
      if (idProveedor) {
        const { error: eRelacion } = await service.from("seg_usuario_proveedores").insert({ id_usuario: segId, id_proveedor: idProveedor });
        if (eRelacion) throw eRelacion;
      }
      usuarios[clave] = { email, password, userId: au.user.id, segId, nombre, nombrePerfil };
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
    if (rolOficina) await crear("ofi", "OFICINA", null, marca + " Oficina");

    const { error: eAsg } = await service.from("seg_asignaciones_asesores").insert({
      id: "ASG9" + cola.slice(-3), id_asesor: usuarios.as1.segId, id_supervisor: usuarios.sup.segId,
      id_proveedor: provA, fecha_inicio: new Date().toISOString().slice(0, 10), estado: "VIGENTE",
    });
    if (eAsg) throw new Error("asignacion: " + eAsg.message);
    creados.asignaciones.push("ASG9" + cola.slice(-3));

    const idA = cola.slice(-3);
    const idB = String((Number(cola) + 1) % 1000).padStart(3, "0");
    const ofA = "OFV9" + idA, ofB = "OFV8" + idB;
    const poA = "POF9" + idA, poB = "POF8" + idB;
    const gvA = "GVE9" + idA, gvB = "GVE8" + idB;
    const asgB = "ASG8" + idB;

    for (const [id, codigo, nombre] of [
      [ofA, "AMCA-" + sufijo + "-A", marca + " Oficina A"],
      [ofB, "AMCA-" + sufijo + "-B", marca + " Oficina B"],
    ]) {
      const { error } = await service.from("mae_oficinas_ventas").insert({
        id, codigo_sap: codigo, nombre, estado: "ACTIVO",
      });
      if (error) throw new Error("oficina " + id + ": " + error.message);
      creados.oficinas.push(id);
    }
    for (const [id, prov, oficina] of [[poA, provA, ofA], [poB, provB, ofB]]) {
      const { error } = await service.from("rel_proveedor_oficinas").insert({
        id, id_proveedor: prov, id_oficina: oficina, estado: "ACTIVO",
      });
      if (error) throw new Error("vinculo " + id + ": " + error.message);
      creados.vinculos.push(id);
    }
    for (const [id, codigo, nombre, prov, oficina] of [
      [gvA, "GVE-" + sufijo + "-A", marca + " Grupo A", provA, ofA],
      [gvB, "GVE-" + sufijo + "-B", marca + " Grupo B", provB, ofB],
    ]) {
      const { error } = await service.from("mae_grupos_vendedores").insert({
        id, codigo_sap: codigo, nombre, id_proveedor: prov, id_oficina: oficina, estado: "ACTIVO",
      });
      if (error) throw new Error("grupo " + id + ": " + error.message);
      creados.grupos.push(id);
    }
    const { error: eAsgB } = await service.from("seg_asignaciones_asesores").insert({
      id: asgB, id_asesor: usuarios.asB.segId, id_supervisor: null, id_proveedor: provB,
      id_oficina: ofB, id_grupo: gvB, fecha_inicio: new Date().toISOString().slice(0, 10), estado: "VIGENTE",
    });
    if (eAsgB) throw new Error("asignacion B: " + eAsgB.message);
    creados.asignaciones.push(asgB);
    const asgCruce = "ASG7" + idB;
    const { error: eAsgCruce } = await service.from("seg_asignaciones_asesores").insert({
      id: asgCruce, id_asesor: usuarios.asB.segId, id_supervisor: usuarios.sup.segId, id_proveedor: provB,
      id_oficina: ofB, id_grupo: gvB, fecha_inicio: new Date().toISOString().slice(0, 10), estado: "VIGENTE",
    });
    if (eAsgCruce) throw new Error("asignacion cruzada: " + eAsgCruce.message);
    creados.asignaciones.push(asgCruce);

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
        // Nombre homónimo de otro proveedor: nunca debe sustituir la identidad Auth.
        asesor: clave === "C3" ? usuarios.as1.nombre : usuarios[quien].nombre,
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
    const idV7 = "VTA-9" + cola.slice(-4) + "7";
    const { error: eV7 } = await service.from("vta_solicitudes_venta").insert({
      id: idV7, id_cliente: cliMae, id_proveedor: provB, canal: "proveedor", pago_modo: "financiado_total",
      tea: 40, estado: "generada", observaciones: marca + " V7",
      created_by: usuarios.as1.userId, id_asesor: usuarios.as1.segId,
      asesor_nombre: usuarios.as1.nombre, ambiente: marca,
    });
    if (eV7) throw new Error("venta de empresa cruzada V7: " + eV7.message);
    creados.ventas.push({ clave: "V7", id: idV7, prov: provB, estado: "generada", creador: "as1" });
    const ventasClave = (clave) => creados.ventas.find((v) => v.clave === clave).id;
    const cotClave = (clave) => creados.cotizaciones.find((c) => c.clave === clave).id;
    for (const clave of ["V5", "V6", "V7"]) {
      const { error } = await service.from("vta_instalaciones").insert({
        solicitud_id: ventasClave(clave), estado: "registrada",
      });
      if (error) throw new Error("instalación " + clave + ": " + error.message);
    }

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

    for (const [clave, u] of Object.entries(usuarios)) {
      const res = await fetch(`${BASE}/api/mi-perfil`, { headers: { cookie: u.cookie, "cache-control": "no-cache" } });
      const perfil = await res.json().catch(() => null);
      const rolEsperado = { admin: "ADMIN", provA: "PROVEEDOR", provB: "PROVEEDOR", sup: "SUPERVISOR", as1: "ASESOR", as2: "ASESOR", asB: "ASESOR", ofi: "OFICINA" }[clave];
      aviso(`${clave} mi-perfil muestra nombre de profile y rol SGT`, res.status === 200 && perfil?.nombre === u.nombrePerfil && perfil?.rol === rolEsperado, `HTTP ${res.status} nombre=${perfil?.nombre} rol=${perfil?.rol}`);
    }

    // Dashboard: solo admin. Proveedor vuelve a instalaciones; el resto a cotizaciones.
    const dashboard = async (clave) => {
      const res = await fetch(`${BASE}/dashboard`, { headers: { cookie: usuarios[clave].cookie }, redirect: "manual" });
      return { status: res.status, location: res.headers.get("location") || "" };
    };
    const rDashAdmin = await dashboard("admin");
    aviso("admin /dashboard -> 200", rDashAdmin.status === 200, `HTTP ${rDashAdmin.status} ${rDashAdmin.location}`);
    const destinosDashboard = [["provA", "/instalaciones"], ["sup", "/cotizaciones"], ["as1", "/cotizaciones"]];
    if (usuarios.ofi) destinosDashboard.push(["ofi", "/cotizaciones"]);
    for (const [clave, destino] of destinosDashboard) {
      const r = await dashboard(clave);
      const redirige = [302, 303, 307, 308].includes(r.status) && r.location.includes(destino);
      aviso(`${clave} /dashboard -> ${destino}`, redirige, `HTTP ${r.status} ${r.location}`);
    }

    const adminPage = async (clave) => {
      const res = await fetch(`${BASE}/admin`, { headers: { cookie: usuarios[clave].cookie }, redirect: "manual" });
      return { status: res.status, location: res.headers.get("location") || "" };
    };
    const rAdminPage = await adminPage("admin");
    aviso("admin /admin -> 200", rAdminPage.status === 200, `HTTP ${rAdminPage.status} ${rAdminPage.location}`);
    const noAdmin = ["provA", "sup", "as1"];
    if (usuarios.ofi) noAdmin.push("ofi");
    for (const clave of noAdmin) {
      const r = await adminPage(clave);
      const bloquea = [302, 303, 307, 308].includes(r.status) && !r.location.includes("/admin");
      aviso(`${clave} /admin por URL -> bloqueado`, bloquea, `HTTP ${r.status} ${r.location}`);
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
    if (process.env.PRUEBAS_PENDIENTES !== "1") {

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
      admin: { ventas: ["V1", "V2", "V3", "V4", "V5", "V6", "V7"], cots: ["C1", "C2", "C3", "C4"], inst: ["V5", "V6", "V7"] },
      provA: { ventas: ["V1", "V2", "V4", "V5"], cots: ["C1", "C2", "C4"], inst: ["V5"] },
      provB: { ventas: ["V3", "V6", "V7"], cots: ["C3"], inst: ["V6", "V7"] },
      sup: { ventas: ["V1", "V5"], cots: ["C1"], inst: [] },
      as1: { ventas: ["V1", "V5"], cots: ["C1"], inst: [] },
      as2: { ventas: ["V2"], cots: ["C2"], inst: [] },
      asB: { ventas: ["V3", "V6"], cots: ["C3"], inst: [] },
    };
    if (usuarios.ofi) esperado.ofi = { ventas: [], cots: [], inst: [] };
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

      const rIP = await op(clave, "listarInstalacionesPendientes", { limit: 100 });
      const puedeVerBandejaInst = clave === "admin" || clave === "provA" || clave === "provB";
      const ventasProveedor = clave === "admin"
        ? creados.ventas.map((v) => v.clave)
        : clave === "provA" ? ["V1", "V2", "V4", "V5"] : clave === "provB" ? ["V3", "V6", "V7"] : [];
      const gotIP = new Set(idsVentas(rIP.cuerpo?.datos));
      const expIP = setDe(ventasProveedor, ventasClave);
      aviso(`${clave} listarInstalacionesPendientes ${puedeVerBandejaInst ? `ve ${fmt(expIP)}` : "no expone instalaciones"}`,
        rIP.status === 200 && iguales(gotIP, expIP), `HTTP ${rIP.status} ve ${fmt(gotIP)}`);
    }

    const detalleInstAsesor = await op("as1", "getVenta", { id: ventasClave("V5") });
    const detalleInstProveedor = await op("provA", "getVenta", { id: ventasClave("V5") });
    aviso("getVenta no expone instalación a asesor", detalleInstAsesor.status === 200 && detalleInstAsesor.cuerpo?.datos?.instalacion == null);
    aviso("getVenta expone instalación al proveedor asignado", detalleInstProveedor.status === 200 && detalleInstProveedor.cuerpo?.datos?.instalacion?.solicitud_id === ventasClave("V5"));
    const registrarInstNoAdmin = await op("as1", "registrarInstalacion", {
      solicitud_id: ventasClave("V5"), foto_antes_url: "https://example.com/a.jpg", foto_despues_url: "https://example.com/b.jpg",
      foto_durante_url: "https://example.com/d.jpg", foto_dni_url: "https://example.com/e.jpg", foto_cliente_dni_url: "https://example.com/f.jpg",
      boleta_url: "https://example.com/b.pdf", acta_url: "https://example.com/c.pdf",
    });
    const liquidarInstNoAdmin = await op("as1", "registrarLiquidacion", {
      solicitud_id: ventasClave("V5"), tipo: "acta",
    });
    aviso("asesor no puede registrar instalación -> 403", registrarInstNoAdmin.status === 403, `HTTP ${registrarInstNoAdmin.status}`);
    aviso("asesor no puede registrar liquidación de instalación -> 403", liquidarInstNoAdmin.status === 403, `HTTP ${liquidarInstNoAdmin.status}`);

    // ------------------------------------------------ aislamiento de maestros y seguridad
    const idsDe = (datos) => filasDe(datos).map((r) => String(r.id)).filter(Boolean);
    const idsCreados = (...ids) => new Set(ids);
    const soloEstos = (got, permitidos, prohibidos = []) =>
      permitidos.every((x) => got.has(x)) && prohibidos.every((x) => !got.has(x));

    const proveedoresPrueba = idsCreados(provA, provB);
    const proveedoresCasos = [
      ["admin", [provA, provB], []],
      ["provA", [provA], [provB]],
      ["provB", [provB], [provA]],
      ["as1", [provA], [provB]],
    ];
    if (usuarios.ofi) proveedoresCasos.push(["ofi", [], [provA, provB]]);
    for (const [clave, permitidos, prohibidos] of proveedoresCasos) {
      const r = await op(clave, "listarProveedoresSGT", { limit: 500 });
      const got = new Set(idsDe(r.cuerpo?.datos).filter((id) => proveedoresPrueba.has(id)));
      aviso(`${clave} listarProveedoresSGT solo ve los suyos`, r.status === 200 && soloEstos(got, permitidos, prohibidos), `HTTP ${r.status} ve ${fmt(got)}`);
    }

    for (const [clave, permitidos, prohibidos] of [
      ["admin", [ofA, ofB], []],
      ["provA", [ofA], [ofB]],
      ["provB", [ofB], [ofA]],
    ]) {
      const r = await op(clave, "listarOficinasVentas", { limit: 500 });
      const got = new Set(idsDe(r.cuerpo?.datos).filter((id) => creados.oficinas.includes(id)));
      aviso(`${clave} listarOficinasVentas solo ve las suyas`, r.status === 200 && soloEstos(got, permitidos, prohibidos), `HTTP ${r.status} ve ${fmt(got)}`);
    }

    for (const [clave, permitidos, prohibidos] of [
      ["admin", [poA, poB], []],
      ["provA", [poA], [poB]],
      ["provB", [poB], [poA]],
    ]) {
      const r = await op(clave, "listarVinculaciones", { limit: 500 });
      const got = new Set(idsDe(r.cuerpo?.datos).filter((id) => creados.vinculos.includes(id)));
      aviso(`${clave} listarVinculaciones solo ve las suyas`, r.status === 200 && soloEstos(got, permitidos, prohibidos), `HTTP ${r.status} ve ${fmt(got)}`);
    }

    for (const [clave, permitidos, prohibidos] of [
      ["admin", [gvA, gvB], []],
      ["provA", [gvA], [gvB]],
      ["provB", [gvB], [gvA]],
    ]) {
      const r = await op(clave, "listarGruposVendedores", { limit: 500 });
      const got = new Set(idsDe(r.cuerpo?.datos).filter((id) => creados.grupos.includes(id)));
      aviso(`${clave} listarGruposVendedores solo ve los suyos`, r.status === 200 && soloEstos(got, permitidos, prohibidos), `HTTP ${r.status} ve ${fmt(got)}`);
    }

    const asgA = "ASG9" + cola.slice(-3);
    for (const [clave, permitidos, prohibidos] of [
      ["admin", [asgA, asgB, asgCruce], []],
      ["provA", [asgA], [asgB, asgCruce]],
      ["provB", [asgB, asgCruce], [asgA]],
      ["sup", [asgA], [asgB, asgCruce]],
      ["as1", [asgA], [asgB, asgCruce]],
      ["asB", [asgB, asgCruce], [asgA]],
    ]) {
      const r = await op(clave, "listarAsignaciones", { limit: 500 });
      const got = new Set(idsDe(r.cuerpo?.datos).filter((id) => creados.asignaciones.includes(id)));
      aviso(`${clave} listarAsignaciones solo ve las suyas`, r.status === 200 && soloEstos(got, permitidos, prohibidos), `HTTP ${r.status} ve ${fmt(got)}`);
    }

    const segsPrueba = new Set(creados.seg);
    const usuariosCasos = [
      ["admin", creados.seg, []],
      ["provA", [usuarios.provA.segId, usuarios.sup.segId, usuarios.as1.segId, usuarios.as2.segId], [usuarios.provB.segId, usuarios.asB.segId]],
      ["provB", [usuarios.provB.segId, usuarios.asB.segId], [usuarios.provA.segId, usuarios.as1.segId]],
      ["sup", [usuarios.as1.segId], [usuarios.sup.segId, usuarios.as2.segId, usuarios.asB.segId]],
      ["as1", [usuarios.as1.segId], [usuarios.as2.segId, usuarios.provA.segId]],
      ["as2", [usuarios.as2.segId], [usuarios.as1.segId, usuarios.provA.segId]],
    ];
    if (usuarios.ofi) usuariosCasos.push(["ofi", [usuarios.ofi.segId], [usuarios.provA.segId, usuarios.asB.segId]]);
    for (const [clave, permitidos, prohibidos] of usuariosCasos) {
      const r = await op(clave, "listarUsuariosSGT", { limit: 500 });
      const got = new Set(idsDe(r.cuerpo?.datos).filter((id) => segsPrueba.has(id)));
      aviso(`${clave} listarUsuariosSGT solo ve los suyos`, r.status === 200 && soloEstos(got, permitidos, prohibidos), `HTTP ${r.status} ve ${fmt(got)}`);
    }

    const soloAdmin = [
      "listarRolesSGT", "getMatrizPermisos", "listarAuditoria",
      "crearProveedorSGT", "actualizarProveedorSGT", "crearOficina", "actualizarOficina",
      "vincularProveedorOficina", "actualizarVinculacion",
      "crearGrupoVendedores", "actualizarGrupoVendedores",
      "crearAsignacion", "actualizarAsignacion",
      "crearRolSGT", "actualizarRolSGT", "crearUsuarioSGT", "actualizarUsuarioSGT",
      "cfgSesionesListar", "cfgSesionesGuardar",
    ];
    for (const nombre of soloAdmin) {
      const r = await op("provA", nombre, {});
      aviso(`provA ${nombre} -> 403`, r.status === 403, `HTTP ${r.status} ${JSON.stringify(r.cuerpo?.error ?? "")}`);
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

    }
    const ventaInstalada = ventasClave("V5");
    const comprobar = async (usuario, operacion, args, esperado) => {
      const respuesta = await op(usuario, operacion, args);
      aviso(`${usuario} ${operacion} -> ${esperado}`, respuesta.status === esperado, `HTTP ${respuesta.status} ${respuesta.cuerpo?.error ?? ""}`);
    };
    const argsLiquidar = { solicitud_id: ventaInstalada, orden_pedido_venta: "ORD-PRUEBA" };
    const expediente = async (usuario, esperado) => {
      const res = await fetch(`${BASE}/api/instalaciones/${ventaInstalada}/expediente/pdf`, {
        headers: { cookie: usuarios[usuario].cookie }, redirect: "manual",
      });
      aviso(`${usuario} expediente sin evidencias -> ${esperado}`, res.status === esperado, `HTTP ${res.status}`);
    };
    await Promise.all([
      expediente("admin", 409), expediente("provA", 409), expediente("provB", 403), expediente("as1", 403),
      comprobar("provA", "getVenta", { id: ventaInstalada }, 200),
      comprobar("provB", "getVenta", { id: ventaInstalada }, 403),
      comprobar("admin", "getVenta", { id: ventaInstalada }, 200),
      comprobar("provA", "liquidarVenta", argsLiquidar, 403),
      comprobar("provB", "liquidarVenta", argsLiquidar, 403),
      comprobar("as1", "liquidarVenta", argsLiquidar, 403),
    ]);
    const { error: ePendiente } = await service.from("vta_instalaciones")
      .update({ estado: "pendiente_liquidar", tipo_liquidacion: "acta" }).eq("solicitud_id", ventaInstalada);
    if (ePendiente) throw new Error(ePendiente.message);
    await comprobar("admin", "liquidarVenta", argsLiquidar, 422);
    const evidencias = ["acta", "boleta", "foto_dni", "foto_cliente_dni", "foto_antes", "foto_durante", "foto_despues"];
    for (const result of await Promise.all([
      service.from("vta_instalacion_evidencias").insert(evidencias.map((tipo) => ({
        solicitud_id: ventaInstalada, tipo, estado: "aprobado", url: "https://example.com/sustento.pdf",
      }))),
      service.from("vta_venta_items").insert({ solicitud_id: ventaInstalada, cantidad: 1, precio_unit: 100, tipo_pedido: "VENTA" }),
      service.from("vta_solicitudes_venta").update({ numero_pedido: `PV-PRUEBA-${sufijo}`, estado: "pendiente_liquidar" }).eq("id", ventaInstalada),
    ])) {
      if (result.error) throw new Error(result.error.message);
    }
    await comprobar("admin", "liquidarVenta", argsLiquidar, 200);
    const { data: liquidada } = await service.from("vta_solicitudes_venta")
      .select("estado,orden_pedido_venta").eq("id", ventaInstalada).single();
    aviso("liquidación guarda estado y orden SAP",
      liquidada?.estado === "liquidada" && liquidada?.orden_pedido_venta === argsLiquidar.orden_pedido_venta);

    // El PDF de cotización sigue el acceso al módulo de cotizaciones.
    const pdfDe = async (clave, cotId) => {
      const res = await fetch(`${BASE}/api/cotizaciones/${cotId}/pdf`, { headers: { cookie: usuarios[clave].cookie }, redirect: "manual" });
      return res.status;
    };
    const pdfEsperado = {
      admin: { C1: 200, C3: 200 },
      provA: { C1: 403, C3: 403 },
      provB: { C1: 403, C3: 403 },
      sup: { C1: 200, C3: 403 },
      as1: { C1: 200, C3: 403 },
      as2: { C1: 403, C3: 403 },
      asB: { C1: 403, C3: 200 },
    };
    if (usuarios.ofi) pdfEsperado.ofi = { C1: 403, C3: 403 };
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
      if (creados.grupos.length) await service.from("mae_grupos_vendedores").delete().in("id", creados.grupos);
      if (creados.vinculos.length) await service.from("rel_proveedor_oficinas").delete().in("id", creados.vinculos);
      if (creados.oficinas.length) await service.from("mae_oficinas_ventas").delete().in("id", creados.oficinas);
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
