import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

const db = new PGlite({ extensions: { vector } });
await db.exec("CREATE EXTENSION IF NOT EXISTS vector");
await db.exec("CREATE TABLE t (id serial primary key, emb vector(4))");
await db.exec("INSERT INTO t (emb) VALUES ('[1,2,3,4]'::vector), ('[1,2,3,5]'::vector), ('[9,9,9,9]'::vector)");
const r = await db.query("SELECT id, 1-(emb <=> $1::vector) AS sim FROM t ORDER BY emb <=> $1::vector LIMIT 3", [
  "[1,2,3,4]",
]);
console.log(JSON.stringify(r.rows));
await db.close();
console.log("PGLITE+PGVECTOR OK");
