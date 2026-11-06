// Minimal PostgREST stand-in: POST /rest/v1/rpc/<fn> → select fn(named args) on PGlite running the real schema.
import { PGlite } from "@electric-sql/pglite"; import fs from "fs"; import http from "http";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;`);
await db.exec(fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`);
await db.exec(`insert into host_secret(id,hash) values (1, encode(sha256(convert_to('test-host-key-1234567890','UTF8')),'hex'))`);
let q = Promise.resolve();
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  let body = ""; req.on("data", c => body += c); req.on("end", () => q = q.then(async () => {
    const fn = req.url.split("/rpc/")[1]; const args = JSON.parse(body || "{}"); const uid = req.headers["x-test-uid"] || "";
    const names = Object.keys(args), vals = names.map(n => args[n]);
    const call = `select * from public.${fn}(${names.map((n, i) => `${n} => $${i + 1}${typeof args[n] === "object" && args[n] !== null ? "::jsonb" : ""}`).join(",")})`;
    try {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); select set_config('request.jwt.claims','${JSON.stringify(uid ? { sub: uid } : {})}',false); set role ${uid ? "authenticated" : "anon"}`);
      const r = await db.query(call, vals.map(v => typeof v === "object" && v !== null ? JSON.stringify(v) : v));
      await db.exec("reset role");
      let out = r.rows; if (r.fields.length === 1 && r.fields[0].name === fn) out = r.rows[0][fn];
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(out ?? null));
    } catch (e) { await db.exec("reset role"); res.statusCode = 400; res.end(JSON.stringify({ message: e.message })); }
  }));
}).listen(8799, () => console.log("pgrest on 8799"));
