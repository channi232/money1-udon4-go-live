/**
 * ตรวจว่าไม่มีอักษรแบบ mojibake ของ UTF-8 ที่ถูกอ่านผิด (มักเห็นเป็น à¸ à¹)
 * รันก่อน build เพื่อกัน regression หลังแก้ไฟล์ด้วยสคริปต์/เครื่องมือที่ encoding ไม่ตรง
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "src");
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const BAD = /à¸|à¹/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(name.name))) out.push(p);
  }
  return out;
}

if (!fs.existsSync(ROOT)) {
  console.error("check-text-encoding: missing src/", ROOT);
  process.exit(1);
}

const files = walk(ROOT);
const hits = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (BAD.test(text)) hits.push(file);
}

if (hits.length) {
  console.error("check-text-encoding: พบลักษณะ mojibake (à¸/à¹) ในไฟล์:");
  for (const f of hits) console.error(" -", f);
  process.exit(1);
}

console.log("check-text-encoding: OK (", files.length, "ไฟล์)");
process.exit(0);
