const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const PUERTO = Number(process.env.PRUEBAS_CARGA_PORT || 3114);
const BASE = `http://127.0.0.1:${PUERTO}`;
const VERBOSO = process.env.PRUEBAS_VERBOSE === "1";

function cargarEnvLocal() {
  const archivo = path.join(root, ".env.local");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const i = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
  return arr[i];
};
const fmtMs = (n) => `${n.toFixed(0)} ms`;

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
    console.log("Carga: omitido (faltan claves de Supabase)");
    return { omitido: true };
  }
  if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
    console.log("Carga: omitido (sin build; ejecute npm run build)");
    return { omitido: true };
  }

  const { createClient } = require("@supabase/supabase-js");
  const { createServerClient } = require("@supabase/ssr");
  const service = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const dominios = String(process.env.AUTH_ALLOWED_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const dominio = dominios[0] ?? "example.com";
  const sufijo = Date.now().toString(36).toUpperCase();
  const cola = String(Date.now()).slice(-3);
  const marca = "PRUEBA CARGA " + sufijo;
  const creados = { auth: [], profiles: [], seg: [], prov: null };
  const usuarios = {};
  let servidor = null;

  try {
    const { data: roles } = await service.from("roles").select("id,nombre");
    const rolAdmin = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "admin");
    const rolAsesor = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "asesor");
    const rolOficina = (roles ?? []).find((r) => String(r.nombre).toLowerCase() === "oficina");
    if (!rolAdmin || !rolAsesor) throw new Error("tabla roles sin admin/asesor");

    const prov = "PRV" + String((Number(cola) + 700) % 10000).padStart(4, "0");
    const ruc = "7" + String(Date.now()).slice(-10);
    const { error: eProv } = await service.from("mae_proveedores").insert({
      id: prov, interlocutor: marca, ruc, razon_social: marca, nombre_comercial: marca, estado: "ACTIVO",
    });
    if (eProv) throw new Error("proveedor: " + eProv.message);
    creados.prov = prov;

    let n = 0;
    const crear = async (clave, rolSeg, rolApp, idProveedor, nombre) => {
      n++;
      const email = `carga.${clave}.${sufijo.toLowerCase()}@${dominio}`;
      const password = "Cg." + Math.random().toString(36).slice(2, 11) + "0Aa";
      const { data: au, error: eAu } = await service.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre },
      });
      if (eAu) throw eAu;
      creados.auth.push(au.user.id);
      const { error: eP } = await service.from("profiles").insert({
        id: au.user.id, email, nombre, rol_id: rolApp.id, activo: true,
      });
      if (eP) throw eP;
      creados.profiles.push(au.user.id);
      const segId = "U9" + cola + n;
      const { error: eS } = await service.from("seg_usuarios").insert({
        id: segId, nombre, tipo_doc: "DNI", nro_doc: "9" + cola + n, correo: email,
        rol_codigo: rolSeg, id_proveedor: idProveedor, estado: "ACTIVO",
      });
      if (eS) throw eS;
      creados.seg.push(segId);
      usuarios[clave] = { email, password, userId: au.user.id, segId, nombre };
    };

    await crear("admin", "ADMIN", rolAdmin, null, marca + " Admin");
    await crear("prov", "PROVEEDOR", rolAsesor, prov, marca + " Proveedor");
    await crear("sup", "SUPERVISOR", rolAsesor, prov, marca + " Supervisor");
    await crear("ase", "ASESOR", rolAsesor, prov, marca + " Asesor");
    if (rolOficina) await crear("ofi", "ASESOR", rolOficina, null, marca + " Oficina");

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
      u.cookie = jar.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
    }

    const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
    servidor = spawn(process.execPath, [nextBin, "start", "-p", String(PUERTO)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    servidor.stdout.on("data", () => undefined);
    servidor.stderr.on("data", (d) => { if (VERBOSO) process.stderr.write(d); });
    if (!(await esperarServidor(90_000))) throw new Error("next start no respondiÃ³");

    const op = async (clave, nombre, argumentos) => {
      const u = usuarios[clave];
      const t0 = process.hrtime.bigint();
      let status = 0;
      try {
        const res = await fetch(BASE + "/api/operacion", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: u.cookie },
          body: JSON.stringify({ operacion: nombre, argumentos: argumentos ?? {}, modulo: "carga" }),
          signal: AbortSignal.timeout(15_000),
        });
        status = res.status;
        await res.arrayBuffer().catch(() => undefined);
      } catch {
        status = 0;
      }
      return { ms: Number(process.hrtime.bigint() - t0) / 1e6, status };
    };

    const seguridad = async (clave, ruta) => {
      const res = await fetch(BASE + ruta, { headers: { cookie: usuarios[clave].cookie }, redirect: "manual" });
      return { status: res.status, location: res.headers.get("location") || "" };
    };

    console.log("\n=== Seguridad de sesiÃ³n ===");
    const sinSesion = await fetch(BASE + "/api/operacion", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operacion: "listarVentas", argumentos: {} }),
    });
    console.log(`Sin sesiÃ³n /api/operacion: ${sinSesion.status === 401 ? "OK 401" : "FALLO " + sinSesion.status}`);
    const adminProv = await seguridad("prov", "/admin");
    console.log(`Proveedor /admin: ${[302, 303, 307, 308].includes(adminProv.status) ? "OK bloqueado" : "FALLO " + adminProv.status}`);

    const casos = {
      admin: [["exportarVentas", {}], ["listarCotizaciones", { limit: 100 }]],
      prov: [["listarInstalaciones", { limit: 100, page: 1, pageSize: 100 }], ["listarVentas", { limit: 100 }]],
      sup: [["listarCotizaciones", { limit: 100 }]],
      ase: [["listarCotizaciones", { limit: 100 }]],
      ofi: [["listarClientesSGT", { limit: 10, page: 1, pageSize: 10 }], ["listarVentas", { limit: 100 }]],
    };
    const rolesCarga = Object.keys(casos).filter((k) => usuarios[k]);

    console.log("\n=== Calentamiento ===");
    for (const clave of rolesCarga) {
      const [nombre, args] = casos[clave][0];
      const r = await op(clave, nombre, args);
      console.log(`${clave}: ${r.status} ${fmtMs(r.ms)}`);
    }

    const ejecutarStage = async (usuariosConcurrentes, duracionMs) => {
      const fin = Date.now() + duracionMs;
      const latencias = [];
      const errores = [];
      const porRol = new Map();
      const workers = Array.from({ length: usuariosConcurrentes }, (_, i) => (async () => {
        const clave = rolesCarga[i % rolesCarga.length];
        let iter = i;
        const ops = casos[clave];
        while (Date.now() < fin) {
          const [nombre, args] = ops[iter++ % ops.length];
          const r = await op(clave, nombre, args);
          latencias.push(r.ms);
          porRol.set(clave, (porRol.get(clave) ?? 0) + 1);
          if (r.status < 200 || r.status >= 300) errores.push({ clave, nombre, status: r.status });
        }
      })());
      await Promise.all(workers);
      latencias.sort((a, b) => a - b);
      const total = latencias.length;
      const err = errores.length;
      const dur = duracionMs / 1000;
      return {
        usuarios: usuariosConcurrentes,
        requests: total,
        rps: total / dur,
        errorPct: total ? (err / total) * 100 : 100,
        p50: pct(latencias, 50),
        p95: pct(latencias, 95),
        p99: pct(latencias, 99),
        max: latencias[latencias.length - 1] ?? 0,
        porRol,
        errores,
      };
    };

    console.log("\n=== Carga concurrente (API autenticada) ===");
    console.log("Conc. | Req | RPS | Error | p50 | p95 | p99 | mÃ¡x");
    const resultados = [];
    for (const conc of [5, 10, 20, 40, 60, 80, 100, 150, 200]) {
      const r = await ejecutarStage(conc, 6_000);
      resultados.push(r);
      console.log(
        `${String(r.usuarios).padStart(5)} | ${String(r.requests).padStart(4)} | ${r.rps.toFixed(1).padStart(5)} | ${r.errorPct.toFixed(1).padStart(5)}% | ${fmtMs(r.p50).padStart(8)} | ${fmtMs(r.p95).padStart(8)} | ${fmtMs(r.p99).padStart(8)} | ${fmtMs(r.max)}`
      );
      if (r.errores.length) {
        const muestra = r.errores.slice(0, 5).map((e) => `${e.clave}/${e.nombre}:${e.status}`).join(", ");
        console.log(`  errores: ${muestra}${r.errores.length > 5 ? " ..." : ""}`);
      }
    }

    const estable = resultados.filter((r) => r.errorPct <= 1 && r.p95 <= 3_000);
    const maxEstable = estable.length ? estable[estable.length - 1] : null;
    console.log("\n=== Resultado ===");
    console.log(maxEstable
      ? `Mayor concurrencia estable probada: ${maxEstable.usuarios} usuarios virtuales (p95 ${fmtMs(maxEstable.p95)}, error ${maxEstable.errorPct.toFixed(1)}%, SLO p95 <= 3 s).`
      : "No se alcanzÃ³ un escenario estable con p95 <= 3 s y error <= 1%.");

    return { resultados, maxEstable };
  } finally {
    try {
      if (servidor) { servidor.kill(); await dormir(700); }
      if (creados.profiles.length) {
        await service.from("audit_log").delete().in("user_id", creados.profiles);
        await service.from("sesiones_app").delete().in("user_id", creados.profiles);
        await service.from("profiles").delete().in("id", creados.profiles);
      }
      if (creados.seg.length) await service.from("seg_usuarios").delete().in("id", creados.seg);
      for (const id of creados.auth) await service.auth.admin.deleteUser(id);
      if (creados.prov) await service.from("mae_proveedores").delete().eq("id", creados.prov);
      console.log("Datos temporales de carga eliminados.");
    } catch (e) {
      console.error("Limpieza de carga:", e && e.message ? e.message : e);
    }
  }
}

module.exports = { ejecutar };

if (require.main === module) {
  ejecutar().then((r) => {
    if (r?.omitido) process.exit(0);
    const max = r?.maxEstable;
    process.exit(max ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(1); });
}

