// BU Job Lab · multiplayer layer (Supabase). No-op when config is empty.
(function () {
  const C = window.BU_CONFIG || {}; window.BU = window.BU || {};
  if (!C.supabaseUrl || !C.supabaseAnonKey) return;
  const $ = s => document.querySelector(s);
  const store = { get(k, d) { try { const v = localStorage.getItem("bujl:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bujl:" + k, JSON.stringify(v)); } catch (e) {} } };
  let sb, code = store.get("code", null), offset = 0, status = null;
  const ready = import("https://esm.sh/@supabase/supabase-js@2").then(m => { sb = m.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { persistSession: true, storageKey: "bujl-auth" } }); });

  document.documentElement.classList.add("mp");
  const qc = new URLSearchParams(location.search).get("code");
  document.addEventListener("DOMContentLoaded", () => { const i = $("#join-code"); if (i && (qc || code)) i.value = (qc || code).toUpperCase(); const n = $("#join-nick"); if (n && store.get("nick", "")) n.value = store.get("nick", ""); });
  const err = t => { const e = $("#join-err"); e.textContent = t; e.hidden = !t; };
  async function ensureSession() { const { data } = await sb.auth.getSession(); if (!data.session) { const r = await sb.auth.signInAnonymously(); if (r.error) throw r.error; } }
  async function fetchEvent(c) { const { data, error } = await sb.rpc("event_by_code", { p_code: c }); if (error) throw error; return data && data[0]; }
  function applyEvent(ev) {
    status = ev.status; offset = Date.parse(ev.server_now) - Date.now();
    if (ev.started_at) BU.eventStart = Date.parse(ev.started_at) - offset;
    $("#g-event").textContent = ev.title + " · " + ev.code;
  }
  async function waitLive() {
    $("#join-form").hidden = true; $("#join-wait").hidden = false;
    for (;;) { const ev = await fetchEvent(code); if (ev) { applyEvent(ev); if (ev.status === "live") break; if (ev.status === "closed") { $("#join-wait").textContent = "המשחק הסתיים."; return; } } await new Promise(r => setTimeout(r, 2500)); }
    BU.startGame();
  }
  BU.beforeStart = async function () {
    err("");
    const c = $("#join-code").value.trim().toUpperCase(), full = $("#join-name").value.trim(), nick = $("#join-nick").value.trim();
    if (!/^\d{6}[A-Z]{2}$/.test(c)) return err("קוד לא תקין. הקוד הוא התאריך ועוד שתי אותיות, למשל 051126BU.");
    if (full.length < 2) return err("שם מלא, בבקשה.");
    if (nick.length < 2) return err("צריך כינוי. משהו עם כבוד, זה יופיע על המסך הגדול.");
    $("#join-go").disabled = true;
    try {
      await ready; await ensureSession();
      const { error } = await sb.rpc("join_event", { p_code: c, p_full_name: full, p_nickname: nick }); if (error) throw error;
      code = c; store.set("code", c); store.set("nick", nick);
      const ev = await fetchEvent(c); applyEvent(ev);
      $("#intro").hidden = true; store.set("intro", 1);
      BU.tutorial(() => { if (status === "live") BU.startGame(); else { $("#intro").hidden = false; waitLive(); } });
    } catch (e) { err(/not open/.test(e.message) ? "האירוע לא פתוח. בדקו את הקוד מול המנחה." : "לא הצלחנו להתחבר: " + e.message); }
    finally { $("#join-go").disabled = false; }
  };
  let pending = null, busy = false;
  BU.report = function (p) { pending = p; if (!busy) flush(); };
  async function flush() {
    if (!code || !pending || status === "closed") return; busy = true;
    const p = pending; pending = null;
    try { await ready; await sb.rpc("report_progress", { p_code: code, p_score: p.score, p_missions: p.missions, p_stats: { lights: p.lights, opened: p.opened, searches: p.searches, marks: p.marks, ats: p.ats || null } }); } catch (e) {}
    busy = false; if (pending) setTimeout(flush, 1200);
  }
  BU.ready = async function () {
    if (!code || !store.get("intro", null)) return;
    try { await ready; await ensureSession(); const ev = await fetchEvent(code);
      if (!ev) return; applyEvent(ev); if (ev.status !== "live") { $("#intro").hidden = false; waitLive(); } } catch (e) {}
  };
  setInterval(async () => { if (!code || !sb) return; try { const ev = await fetchEvent(code); if (ev) { applyEvent(ev); if (ev.status === "closed") $("#timer").textContent = "סוף"; } } catch (e) {} }, 15000);
})();
