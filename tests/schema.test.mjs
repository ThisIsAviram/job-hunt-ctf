import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const sql = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
// Supabase shims: roles + auth schema reading claims from settings
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table auth.identities (user_id uuid, provider text, identity_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
`);
await db.exec(sql);
await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓", m); } else { fail++; console.log("✗", m); } };
const seen = new Set();
async function as(uid, meta, fn) {
  if (uid && meta && meta.user_name && !seen.has(uid)) { seen.add(uid); await db.query(`insert into auth.identities values ($1,'github',$2)`, [uid, JSON.stringify({ user_name: meta.user_name })]); }
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ""}', false); select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, user_metadata: meta || {} })}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const ADMIN = "00000000-0000-0000-0000-00000000000a", P1 = "00000000-0000-0000-0000-000000000001", P2 = "00000000-0000-0000-0000-000000000002", EVIL = "00000000-0000-0000-0000-00000000000e";
// admin creates event
await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`insert into events (code,title,status) values ('061126BU','test','lobby')`));
let r = await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`select * from events`)); ok(r.rows.length === 1, "admin creates + sees event");
// non-admin cannot list events or create
r = await as(EVIL, { user_name: "hacker" }, () => db.query(`select * from events`)); ok(r.rows.length === 0, "non-admin cannot list events");
try { await as(EVIL, { user_name: "hacker" }, () => db.query(`insert into events (code) values ('061126XX')`)); ok(false, "non-admin insert blocked"); } catch (e) { ok(true, "non-admin insert blocked"); }
// event_by_code works for anyone
r = await as(P1, {}, () => db.query(`select * from event_by_code('061126bu')`)); ok(r.rows.length === 1 && r.rows[0].status === "lobby", "event_by_code (case-insensitive)");
// join
await as(P1, {}, () => db.query(`select join_event('061126BU','דנה כהן','Recruiter Slayer')`));
await as(P2, {}, () => db.query(`select join_event('061126BU','יוסי לוי','ATS Whisperer')`));
r = await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`select * from players`)); ok(r.rows.length === 2, "two players joined");
try { await as(P1, {}, () => db.query(`select join_event('000000ZZ','x y','zz')`)); ok(false, "bad code rejected"); } catch (e) { ok(/not open/.test(e.message), "bad code rejected"); }
// report before live is ignored
await as(P1, {}, () => db.query(`select report_progress('061126BU', 50, '{}'::jsonb, '{}'::jsonb)`));
r = await as(P1, {}, () => db.query(`select score from players`)); ok(r.rows[0].score === 0, "report ignored while lobby");
// go live
await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`update events set status='live', started_at=now()`));
await as(P1, {}, () => db.query(`select report_progress('061126BU', 55, '{"time":15}'::jsonb, '{"opened":12}'::jsonb)`));
await as(P2, {}, () => db.query(`select report_progress('061126BU', 999, '{}'::jsonb, '{}'::jsonb)`));
r = await as(P1, {}, () => db.query(`select * from leaderboard('061126BU')`));
ok(r.rows.length === 2 && r.rows[1].nickname === "Recruiter Slayer" && r.rows[1].score === 55 && r.rows[1].missions.time === 15, "leaderboard order + score + missions");
ok(r.rows[0].score === 100, "score clamped to 100");
ok(!("full_name" in r.rows[0]), "leaderboard hides full names");
// player sees only own row
r = await as(P1, {}, () => db.query(`select * from players`)); ok(r.rows.length === 1 && r.rows[0].nickname === "Recruiter Slayer", "player sees only own row");
// player can't edit others
await as(P1, {}, () => db.query(`update players set score=0 where nickname='ATS Whisperer'`));
r = await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`select score from players where nickname='ATS Whisperer'`)); ok(r.rows[0].score === 100, "player cannot edit others");
// close → reports ignored
await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`update events set status='closed'`));
await as(P1, {}, () => db.query(`select report_progress('061126BU', 5, '{}'::jsonb, '{}'::jsonb)`));
r = await as(P1, {}, () => db.query(`select score from players`)); ok(r.rows[0].score === 55, "reports ignored after close");
try { await as(P1, {}, () => db.query(`select join_event('061126BU','late comer','late')`)); ok(false, "join after close blocked"); } catch (e) { ok(true, "join after close blocked"); }
// draft events invisible
await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`insert into events (code) values ('061126DR')`));
r = await as(P1, {}, () => db.query(`select * from event_by_code('061126DR')`)); ok(r.rows.length === 0, "draft event hidden");

// metadata spoofing must not grant admin
r = await as(P1, {}, async () => { await db.query(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: P1, user_metadata: { user_name: "ThisIsAviram" } })}', false)`); return db.query(`select public.is_admin() a`); });
ok(r.rows[0].a === false, "spoofed user_metadata.user_name is not admin");
// ── host key (deck control) ──
const KEY = "deck-key-0123456789abcdef";
try { await as(EVIL, { user_name: "hacker" }, () => db.query(`select set_host_secret('${KEY}')`)); ok(false, "non-admin cannot set host key"); } catch (e) { ok(/not admin/.test(e.message), "non-admin cannot set host key"); }
try { await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`select set_host_secret('short')`)); ok(false, "short key rejected"); } catch (e) { ok(/too short/.test(e.message), "short key rejected"); }
await as(ADMIN, { user_name: "ThisIsAviram" }, () => db.query(`select set_host_secret('${KEY}')`));
r = await db.query(`select hash from host_secret`); ok(r.rows[0].hash.length === 64 && !r.rows[0].hash.includes("deck"), "only hash stored");
await db.exec(`select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '{}', false); set role anon`);
try { await db.query(`select * from host_secret`); r = await db.query(`select * from host_secret`); ok(r.rows.length === 0, "anon cannot read host_secret"); } catch (e) { ok(true, "anon cannot read host_secret"); }
try { await db.query(`select host_open_event('wrong-key-wrong-key-x','071126AB','t',12)`); ok(false, "wrong key rejected"); } catch (e) { ok(/bad host key/.test(e.message), "wrong key rejected"); }
try { await db.query(`select host_open_event('${KEY}','07112AB','t',12)`); ok(false, "bad code rejected"); } catch (e) { ok(/bad code/.test(e.message), "bad code format rejected"); }
r = await db.query(`select host_open_event('${KEY}','071126ab','שיח',10) as e`); ok(r.rows[0].e.status === "lobby" && r.rows[0].e.code === "071126AB" && r.rows[0].e.duration_min === 10, "host opens event in lobby");
r = await db.query(`select host_open_event('${KEY}','071126AB','שיח',12) as e`); ok(r.rows[0].e.duration_min === 12, "reopen in lobby updates duration (idempotent)");
r = await db.query(`select host_set_status('${KEY}','071126AB','live') as e`); ok(r.rows[0].e.status === "live" && r.rows[0].e.started_at, "host START sets clock");
const st0 = r.rows[0].e.started_at;
r = await db.query(`select host_set_status('${KEY}','071126AB','live',14) as e`); ok(r.rows[0].e.duration_min === 14 && r.rows[0].e.started_at === st0, "extend keeps clock, adds minutes");
r = await db.query(`select host_set_status('${KEY}','071126AB','live',12) as e`);
r = await db.query(`select host_open_event('${KEY}','071126AB','שיח',30) as e`); ok(r.rows[0].e.status === "live" && r.rows[0].e.duration_min === 12, "reopen while live keeps state");
r = await db.query(`select host_set_status('${KEY}','071126AB','closed') as e`); ok(r.rows[0].e.status === "closed", "host closes");
try { await db.query(`select host_set_status('${KEY}','071126AB','draft')`); ok(false, "bad status"); } catch (e) { ok(/bad status/.test(e.message), "bad status rejected"); }
let upd = []; try { upd = (await db.query(`update events set status='live' returning id`)).rows; } catch (e) {}
await db.exec("reset role");
r = await db.query(`select status from events where code='071126AB'`); ok(upd.length === 0 && r.rows[0].status === "closed", "anon cannot update events directly");
console.log(`\n${pass} passed, ${fail} failed`);
