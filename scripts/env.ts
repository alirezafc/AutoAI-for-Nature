import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

export function loadEnv(): void {
  const cwd = process.cwd();
  for (const name of [".env.local", ".env", ".env.production"]) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      config({ path: p });
    }
  }
}
