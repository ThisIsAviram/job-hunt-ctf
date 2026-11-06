import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { PGlite } from "/tmp/pgt/node_modules/@electric-sql/pglite/dist/index.js";
import fs from "fs";
const SITE = "http://localhost:8765/";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;`);
await db.exec(fs.readFileSync("/home/claude/deck/ctf/site/supabase/schema.sql", "utf8"));
await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`);
const mock = fs.readFileSync("/tmp/e2e/mock-supabase.js", "utf8");
let lock = Promise.resolve();
async function exec(session, fn) {
  const run = async () => {
    const u = session && session.user;
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${u ? u.id : ""}', false); select set_config('request.jwt.claims', $$${JSON.stringify({ sub: u && u.id, user_metadata: (u && u.user_metadata) || {} })}$$, false); set role ${u ? "authenticated" : "anon"};`);
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const p = lock.then(run, run); lock = p.catch(() => {}); return p;
}
const safe = c => { if (!/^[a-z_]+$/.test(c)) throw new Error("bad col"); return c; };
async function handle(path, body) {
  try {
    if (path === "rpc") {
      const a = body.args || {}, keys = Object.keys(a);
      const sql = `select * from ${safe(body.name)}(${keys.map((k, i) => `${safe(k)} => $${i + 1}`).join(", ")})`;
      const vals = keys.map(k => typeof a[k] === "object" && a[k] !== null ? JSON.stringify(a[k]) : a[k]);
      const r = await exec(body.session, () => db.query(sql, vals));
      const rows = r.rows; const scalar = rows.length === 1 && Object.keys(rows[0]).length === 1 && ["join_event", "report_progress"].includes(body.name);
      return { data: scalar ? Object.values(rows[0])[0] : rows, error: null };
    }
    const q = body.q, t = safe(q.table), vals = []; const w = q.filters.map(([c, v]) => { vals.push(v); return `${safe(c)} = $${vals.length}`; });
    const where = w.length ? " where " + w.join(" and ") : "";
    let sql;
    if (q.op === "select") sql = `select * from ${t}${where}${q.order ? ` order by ${safe(q.order[0])} ${q.order[1] ? "asc" : "desc"}` : ""}${q.limit ? ` limit ${+q.limit}` : ""}`;
    else if (q.op === "insert") { const ks = Object.keys(q.values); ks.forEach(k => vals.push(q.values[k])); sql = `insert into ${t} (${ks.map(safe).join(",")}) values (${ks.map((k, i) => `$${i + 1}`).join(",")}) returning *`; }
    else if (q.op === "update") { const ks = Object.keys(q.values); const set = ks.map(k => { vals.push(q.values[k]); return `${safe(k)} = $${vals.length}`; }); sql = `update ${t} set ${set.join(", ")}${where.replace(/\$(\d+)/g, (m, n) => "$" + (+n + 0))} returning *`;
      // re-number: filters were pushed first
      const fv = q.filters.map(f => f[1]); const sv = ks.map(k => q.values[k]); vals.length = 0; vals.push(...fv, ...sv);
      sql = `update ${t} set ${ks.map((k, i) => `${safe(k)} = $${fv.length + i + 1}`).join(", ")}${where} returning *`; }
    else if (q.op === "delete") sql = `delete from ${t}${where} returning *`;
    const r = await exec(body.session, () => db.query(sql, vals));
    return { data: q.single ? r.rows[0] : r.rows, error: null };
  } catch (e) { return { data: null, error: { message: e.message } }; }
}
const results = []; const ok = (c, m) => { results.push([c, m]); console.log(c ? "✓" : "✗", m); };
const b = await chromium.launch();
async function page(name, w = 1600, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.route(/esm\.sh\/@supabase/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: mock }));
  await ctx.route(/fonts\.(googleapis|gstatic)|google\.com\/s2/, r => r.abort());
  await ctx.route(/\/__mock\//, async r => { const path = r.request().url().split("/__mock/")[1]; const out = await handle(path, JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); });
  const p = await ctx.newPage(); p.on("pageerror", e => console.log(`[${name}] pageerror`, e.message)); return p;
}
// --- admin: login + create event
const admin = await page("admin", 1400, 900);
await admin.goto(SITE + "admin.html"); await admin.waitForTimeout(500);
await admin.click("#gh"); await admin.waitForTimeout(900);
ok(await admin.$("#create"), "admin logged in via GitHub (mock) and sees console");
await admin.fill("#cl", "BU"); await admin.click("#create"); await admin.waitForTimeout(700);
const code = (await admin.textContent(".big")).trim(); ok(/^\d{6}BU$/.test(code), "event created with date+2 letters code: " + code);
// --- leaderboard
const lb = await page("lb", 1920, 1080); await lb.goto(SITE + "leaderboard.html?code=" + code); await lb.waitForTimeout(800);
ok((await lb.textContent("#code")).trim() === code, "leaderboard shows code");
// --- players join
async function join(name, nick) {
  const p = await page(nick); await p.goto(SITE + "?code=" + code); await p.waitForTimeout(700);
  ok((await p.inputValue("#join-code")) === code, `${nick}: code prefilled from link`);
  await p.fill("#join-name", name); await p.fill("#join-nick", nick); await p.click("#join-go"); await p.waitForTimeout(900);
  // tutorial: skip
  if (await p.$(".cb-skip")) await p.click(".cb-skip"); await p.waitForTimeout(500);
  return p;
}
const p1 = await join("דנה כהן", "Recruiter Slayer");
ok(!(await p1.isHidden("#join-wait")), "player waits in lobby until START");
const p2 = await join("יוסי לוי", "ATS Whisperer");
await admin.waitForTimeout(4500); ok((await admin.textContent("#detail")).includes("דנה כהן"), "admin sees full names");
await lb.waitForTimeout(3500); ok((await lb.textContent("#n")).trim() === "2", "leaderboard counts 2 players in lobby");
// --- START
await admin.click('[data-st="live"]'); await admin.waitForTimeout(3500);
ok(await p1.isHidden("#intro"), "player game starts after START");
const t1 = await p1.textContent("#timer"); ok(/^1[12]:\d\d$/.test(t1), "timer synced from server start: " + t1);
// p1 solves junior
await p1.click('[data-mission="junior"]');
for (const id of ["d4", "b4", "b5", "h2"]) { await p1.click(`.card[data-id="${id}"]`); await p1.click(`[data-mark="${id}"]`); }
await p1.click('[data-check="junior"]'); await p1.waitForTimeout(400);
// p2 partial spam with one wrong
await p2.click('[data-mission="spam"]');
for (const id of ["s1", "s3", "b1"]) { await p2.click(`.card[data-id="${id}"]`); await p2.click(`[data-mark="${id}"]`); }
await p2.click('[data-check="spam"]'); await p2.waitForTimeout(400);
const p2res = await p2.textContent("#active .result"); ok(/2 מתוך 5/.test(p2res) && /שגויים/.test(p2res), "partial scoring + wrong-mark penalty: " + p2res.trim());
await p1.waitForTimeout(2500);
await lb.waitForTimeout(3500);
const rows = await lb.$$eval(".row", rs => rs.map(r => [r.querySelector(".nick").textContent, r.querySelector(".pts").textContent]));
ok(rows.length === 2 && rows[0][0] === "Recruiter Slayer" && rows[0][1] === "10", "live leaderboard ranks by score: " + JSON.stringify(rows));
ok(!(await lb.textContent("body")).includes("דנה כהן"), "leaderboard shows nicknames only");
await lb.screenshot({ path: "/tmp/e2e/leaderboard.png" });
await admin.screenshot({ path: "/tmp/e2e/admin.png" });
await p1.screenshot({ path: "/tmp/e2e/player.png" });
// close
await admin.click('[data-st="closed"]'); await admin.waitForTimeout(800);
const r2 = await handle("rpc", { name: "leaderboard", args: { p_code: code }, session: null });
ok(r2.data.length === 2, "leaderboard still readable after close");
await b.close();
const f = results.filter(r => !r[0]).length; console.log(`\n${results.length - f} passed, ${f} failed`);
