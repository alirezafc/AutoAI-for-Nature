// Post-install setup for AutoAI.
// Ensures local demo-mode working directories exist.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname ?? ".", "..");
const pglite = path.join(root, ".pglite");
if (!fs.existsSync(pglite)) {
  fs.mkdirSync(pglite, { recursive: true });
}

console.log("AutoAI: dependencies installed. Demo database directory ready at .pglite/");
console.log("  npm run db:migrate   apply schema");
console.log("  npm run db:seed      load demo content");
console.log("  npm run dev          start the platform");
