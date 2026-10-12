const XLSX = require("xlsx");
const wb = XLSX.readFile("C:\\Users\\agente.calidda\\Downloads\\Materiales_ AMCA 2026.xlsx");
console.log("HOJAS: " + JSON.stringify(wb.SheetNames));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log("\n===== HOJA: " + name + " (" + rows.length + " filas) =====");
  console.log("CABECERA: " + JSON.stringify(rows[0]));
  for (let i = 1; i < Math.min(6, rows.length); i++) {
    console.log("FILA " + i + ": " + JSON.stringify(rows[i]).slice(0, 600));
  }
}
