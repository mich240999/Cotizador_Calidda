const { buildCotizacionPdf } = require("./.tmp-pdftest/cotizacionPdf.js");
const d = {
  codigo: "COT-AMCA-TEST", estado: "Pendiente", fecha: "01/10/2026",
  observaciones: "Obs de prueba con eñes y tildes: cotización",
  subtotal: 3150, descuento: 0, total: 3150,
  clienteNombre: "CLIENTE PRUEBA", clienteDoc: "DNI 12345678",
  clienteEmail: "c@test.com", clienteTel: "999",
  proveedor: "IBR Peru S.A.", proveedorRuc: "20552836481",
  asesor: "Robert Meza", asesorTelefono: "907551773", asesorEmail: "r@test.com",
  cuotaInicial: 0, capital: 3150, tea: 0.40, plazo: 9, cuotaMensual: 417.74,
  tabla: [3, 6, 9, 12, 18, 24, 36, 48, 60].map((n) => ({ plazo: n, cuota: 100 + n })),
  items: [
    { idx: 1, material: "Closet o Ropero | Puertas Batientes con descripción larga para probar el ajuste multilínea del texto en la celda del PDF", cant: 1, punit: 1600, dscto: 0, neto: 1600 },
    { idx: 2, material: "Mesón de Granito", cant: 2, punit: 650, dscto: 0, neto: 1300 },
  ],
};
const doc = buildCotizacionPdf(d);
const buf = Buffer.from(doc.output("arraybuffer"));
require("fs").writeFileSync(".tmp-test.pdf", buf);
console.log("PF-16 PDF paginas=" + doc.getNumberOfPages() + " bytes=" + buf.length + " " + (buf.length > 5000 && doc.getNumberOfPages() >= 2 ? "PASS" : "FAIL"));
