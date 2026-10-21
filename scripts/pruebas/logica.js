const path = require("path");

const base = process.env.PRUEBAS_BUILD || path.join(process.cwd(), ".pruebas-build");
const fin = require(path.join(base, "financiamiento.js"));
const det = require(path.join(base, "detallesMueble.js"));
const mm = require(path.join(base, "materialMatch.js"));

const VERBOSO = process.env.PRUEBAS_VERBOSE === "1";
let pass = 0;
let fail = 0;
const fallos = [];

function check(nombre, cond, extra) {
  if (cond) {
    pass++;
    if (VERBOSO) console.log("  PASS  " + nombre);
  } else {
    fail++;
    fallos.push("logica: " + nombre + (extra ? " -> " + extra : ""));
    console.log("  FAIL  " + nombre + (extra ? " -> " + extra : ""));
  }
}
const casi = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const tira = (fn) => { try { fn(); return null; } catch (e) { return e; } };

function cuotaModal(capital, n) {
  const TEA = 0.4;
  const IGV = 0.18;
  const tem = Math.pow(1 + TEA, 1 / 12) - 1;
  const i = tem * (1 + IGV);
  return Math.round(((capital * i) / (1 - Math.pow(1 + i, -n)) + Number.EPSILON) * 100) / 100;
}

function ejecutar() {
  check("redondeo2(2.675)=2.68", fin.redondeo2(2.675) === 2.68, String(fin.redondeo2(2.675)));
  check("redondeo2(-0.001)=0", fin.redondeo2(-0.001) === 0, String(fin.redondeo2(-0.001)));
  check("redondeo2(NaN)=0", fin.redondeo2(NaN) === 0);
  check("temDesdeTea(0.40)", casi(fin.temDesdeTea(0.4), Math.pow(1.4, 1 / 12) - 1, 1e-12));
  check("temDesdeTea(-1) lanza", !!tira(() => fin.temDesdeTea(-1)));
  check("temDesdeTea(11) lanza", !!tira(() => fin.temDesdeTea(11)));
  check("cuota capital 0 lanza", !!tira(() => fin.cuotaFrancesaConIgv(0, 0.4, 9)));
  check("cuota n=0 lanza", !!tira(() => fin.cuotaFrancesaConIgv(1000, 0.4, 0)));
  check("cuota n=400 lanza", !!tira(() => fin.cuotaFrancesaConIgv(1000, 0.4, 400)));

  for (const [cap, n] of [[10000, 9], [5000, 12], [12345.67, 24], [999.99, 3], [1, 60]]) {
    const a = fin.cuotaFrancesaConIgv(cap, 0.4, n);
    const b = cuotaModal(cap, n);
    check(`cuota con IGV = modal (${cap}/${n})`, casi(a, b, 0.011), `${a} vs ${b}`);
  }
  const cuota = fin.cuotaFrancesaConIgv(10000, 0.4, 9);
  check("cuota > capital/n", cuota > 10000 / 9, String(cuota));
  check("cuota < 2x capital/n", cuota < (10000 / 9) * 2, String(cuota));
  const t = fin.tablaSimulacion(10000, 0.4);
  check("tablaSimulacion 9 plazos", t.length === 9, String(t.length));
  check("tablaSimulacion cuotas > 0", t.every((f) => f.cuota > 0));
  check("tablaSimulacion 60 < 3", t[t.length - 1].cuota < t[0].cuota);
  check("tablaSimulacion capital 0 -> 0", fin.tablaSimulacion(0, 0.4).every((f) => f.cuota === 0));
  check("tablaSimulacion sin IGV menor", fin.cuotaFrancesa(10000, 0.4, 9) < cuota);

  const d = { marca_melamina: "Arauco", color_estructura: "Blanco", color_puertas: "Roble", color_tablero: "Gris", tiradores: "Acero", vidrios: "No aplica" };
  const comp = det.componerObservaciones(d, "Cliente prefiere entrega por la tarde");
  check("compone bloque detalles", comp.startsWith("[DETALLES DEL MUEBLE]") && comp.includes("[FIN DETALLES]"));
  check("conserva observaciones", comp.trim().endsWith("Cliente prefiere entrega por la tarde"));
  const ex = det.extraerDetalles(comp);
  check("extrae 6 detalles", ex.detalles.length === 6, String(ex.detalles.length));
  check("extrae valor color puertas", ex.detalles.find((x) => x.etiqueta === "Color de Puertas")?.valor === "Roble");
  check("extrae resto libre", ex.resto === "Cliente prefiere entrega por la tarde", JSON.stringify(ex.resto));
  check("sin observaciones no agrega lineas", det.componerObservaciones(d, "   ").endsWith("[FIN DETALLES]"));
  check("resto vacio", det.extraerDetalles(det.componerObservaciones(d, "   ")).resto === "");
  check("texto plano no rompe", det.extraerDetalles("hola").detalles.length === 0);
  check("null no rompe", det.extraerDetalles(null).resto === "");

  check("normaliza tildes", mm.normalizarMaterial("PuÉrtas Áé") === "puertas ae", mm.normalizarMaterial("PuÉrtas Áé"));
  check("normaliza signos", mm.normalizarMaterial(" MDF-18mm  (blanco) ") === "mdf 18mm blanco", mm.normalizarMaterial(" MDF-18mm  (blanco) "));
  check("tokens quita vacias", !mm.tokensMaterial("para el material de la cotizacion").includes("para"));
  check("tokens raiz plural", mm.tokensMaterial("puertas").includes("puerta"), JSON.stringify(mm.tokensMaterial("puertas")));
  check("tokens dedupe", mm.tokensMaterial("puerta puertas puerta").filter((x) => x === "puerta").length === 1);

  const mats = [
    { id: "1", codigo: "MAT-001", nombre: "Mueble bajo", proveedor_nombre: "Otro Proveedor", precio_vigente: 100 },
    { id: "2", codigo: "MAT-999", nombre: "Tablero 18mm blanco", proveedor_nombre: "Maderas SAC", id_proveedor: 7, precio_vigente: 200 },
    { id: "3", codigo: "MAT-500", nombre: "Puertas MDF roble", proveedor_nombre: "Maderas SAC", id_proveedor: 7, precio_vigente: 0 },
  ];
  check("codigo exacto gana", mm.ordenarMateriales(mats, { codigos: ["MAT-001"] }).ordenados[0].id === "1");
  check("proveedor por id puntua", mm.puntajeMaterial(mats[1], { proveedorId: "7" }) >= 60);
  check("proveedor por nombre puntua", mm.puntajeMaterial(mats[1], { proveedorNombre: "maderas sac" }) >= 45);
  check("texto coincidente puntua", mm.puntajeMaterial(mats[2], { texto: "puertas mdf roble" }) > 0);
  check("texto ajeno no puntua", mm.puntajeMaterial(mats[0], { texto: "vidrio templado" }) === 0);
  const ord = mm.ordenarMateriales(mats, { proveedorId: "7", texto: "tablero blanco" });
  check("sugeridos = proveedor", ord.sugeridos.length === 2, String(ord.sugeridos.length));
  check("resto = no coincidentes", ord.resto.length === 1 && ord.resto[0].id === "1");
  check("ordenados = todos", ord.ordenados.length === 3);
  check("con precio primero a igual puntaje", mm.ordenarMateriales(mats, { proveedorId: "7" }).ordenados[0].precio_vigente > 0);
  check("codigoMaterial prioriza codigo", mm.codigoMaterial({ id: "x", codigo: "A", codigo_sap: "B" }) === "A");
  check("precioMaterial usa vigente", mm.precioMaterial({ id: "x", precio_vigente: 5, precio_unit: 9 }) === 5);

  return { pass, fail, fallos };
}

module.exports = { ejecutar };
