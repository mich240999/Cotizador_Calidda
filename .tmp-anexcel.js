const XLSX = require("xlsx");
const wb = XLSX.readFile("C:\\Users\\agente.calidda\\Downloads\\Materiales_ AMCA 2026.xlsx");
const J = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" });
// MATERIALES
const M = J("MATERIALES ");
const esp = {}, espRem = {}, mat = {};
for (let i = 1; i < M.length; i++) {
  const r = M[i];
  if (!r[3] && !r[2]) continue;
  esp[String(r[0] || "(vacio)").trim()] = (esp[String(r[0] || "(vacio)").trim()] || 0) + 1;
  espRem[String(r[1] || "(vacio)").trim()] = (espRem[String(r[1] || "(vacio)").trim()] || 0) + 1;
  if (r[2]) mat[String(r[2]).trim()] = (mat[String(r[2]).trim()] || 0) + 1;
}
console.log("ESPACIO:", JSON.stringify(esp, null, 1));
console.log("ESPACIO_REM(top15):", JSON.stringify(Object.entries(espRem).sort((a, b) => b[1] - a[1]).slice(0, 15), null, 1));
console.log("MATERIAL col values:", JSON.stringify(mat, null, 1));
// filas con responsable/proveedor/asesor/oficina/grupo
console.log("\n--- filas MATERIALES con datos comerciales ---");
for (let i = 1; i < M.length; i++) {
  const r = M[i];
  if (r[5] || r[6] || r[7] || r[8] || r[9]) console.log("F" + i + ": " + JSON.stringify(r.slice(0, 10)));
}
// PROVEEDORES distintos
const P = J("PROVEEDORES");
const ofi = {}, gru = {};
for (let i = 1; i < P.length; i++) {
  if (!P[i][0]) continue;
  ofi[String(P[i][2]).trim()] = (ofi[String(P[i][2]).trim()] || 0) + 1;
  gru[String(P[i][3]).trim()] = (gru[String(P[i][3]).trim()] || 0) + 1;
}
console.log("\nPROV OFICINAS:", JSON.stringify(ofi));
console.log("PROV GRUPOS:", JSON.stringify(Object.keys(gru).length) + " distintos: " + JSON.stringify(Object.keys(gru).slice(0, 40)));
// ASESORES con telefono
const A = J("ASESORES");
let conTel = 0, total = 0;
for (let i = 1; i < A.length; i++) {
  if (!A[i][2]) continue;
  total++;
  if (String(A[i][3]).trim()) conTel++;
}
console.log("\nASESORES con nombre: " + total + ", con teléfono: " + conTel);
