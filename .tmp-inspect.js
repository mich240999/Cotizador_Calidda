const fs = require("fs");
const buf = fs.readFileSync(".tmp-test.pdf");
const s = buf.toString("latin1");
const imgs = (s.match(/\/Subtype\s*\/Image/g) || []).length;
const pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log("images=" + imgs + " pages=" + pages + " bytes=" + buf.length);
let i = s.indexOf("/Width");
while (i > -1 && i < 20000) {
  console.log(JSON.stringify(s.slice(Math.max(0, i - 120), i + 60)).slice(0, 200));
  i = s.indexOf("/Width", i + 1);
  if (i > 60000) break;
}
