const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const out = path.join(root, ".pruebas-build");

function cargarEnvLocal() {
  const archivo = path.join(root, ".env.local");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}

function compilar() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
  const archivos = [
    "lib/alcance.ts",
    "lib/financiamiento.ts",
    "lib/detallesMueble.ts",
    "lib/materialMatch.ts",
    "lib/operaciones.ts",
    "lib/operacionesSGT.ts",
    "lib/operacionesVentas.ts",
  ];
  spawnSync(process.execPath, [tsc, ...archivos, "--outDir", out, "--module", "commonjs", "--target", "ES2020", "--strict", "--skipLibCheck", "--esModuleInterop", "--noEmitOnError", "false"], {
    cwd: root,
    stdio: "inherit",
  });
  const faltan = ["financiamiento.js", "detallesMueble.js", "materialMatch.js", "operaciones.js", "operacionesSGT.js", "operacionesVentas.js"].filter(
    (f) => !fs.existsSync(path.join(out, f))
  );
  if (faltan.length) {
    console.error("No se pudieron compilar: " + faltan.join(", "));
    process.exit(2);
  }
  process.env.PRUEBAS_BUILD = out;
}

(async () => {
  console.log("Compilando modulos de lib/ para las pruebas...");
  compilar();
  cargarEnvLocal();
  const logica = require("./logica");
  const backend = require("./backend");
  const r1 = logica.ejecutar();
  const r2 = await backend.ejecutar();
  const r3 = process.env.PRUEBAS_E2E === "1" ? await require("./e2e").ejecutar() : { pass: 0, fail: 0, fallos: [], omitido: true };
  const r4 = process.env.PRUEBAS_E2E === "1" ? await require("./permisos").ejecutar() : { pass: 0, fail: 0, fallos: [], omitido: true };
  const pass = r1.pass + r2.pass + r3.pass + r4.pass;
  const fail = r1.fail + r2.fail + r3.fail + r4.fail;
  const fallos = [...r1.fallos, ...r2.fallos, ...r3.fallos, ...r4.fallos];
  console.log("\n==============================");
  console.log("RESUMEN: " + pass + " pass, " + fail + " fail" + (r2.omitido ? " (backend omitido: sin credenciales)" : "") + (r3.omitido && process.env.PRUEBAS_E2E === "1" ? " (e2e omitido)" : "") + (r4.omitido && process.env.PRUEBAS_E2E === "1" ? " (permisos omitido)" : ""));
  if (fallos.length) fallos.forEach((f) => console.log(" - " + f));
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
