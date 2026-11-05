(function () {
  "use strict";
  const JOBS = window.JOBS || [], CH = window.CHALLENGES || [], FINAL = window.FINAL || {};
  const SALT = "nitzanim-2030", GAME_MIN = 20, LIGHT_EVERY = 10, LIGHT_MS = 7000;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bujl:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bujl:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  const P = new URLSearchParams(location.search);
  const S = {
    role: "all", level: "all", q: "", sel: null, active: store.get("active", null),
    reveal: P.get("m") === "bu2030",
    marks: store.get("marks", {}),          // missionId -> [jobIds]
    best: store.get("best", {}),            // missionId -> points
    res: store.get("res", {}),              // missionId -> last result
    lightsUsed: store.get("lightsUsed", 0),
    start: store.get("start", null),
    opened: store.get("opened", 0), searches: store.get("searches", 0)
  };
  window.BU = window.BU || {};

  /* ---------- helpers ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const H = {}; // missionId -> {jobId: hash16}
  async function prepHashes() { for (const c of CH) { if (c.type !== "mark") continue; H[c.id] = {}; for (const j of JOBS) H[c.id][j.id] = (await sha(`${SALT}:${c.id}:${j.id}`)).slice(0, 16); } }
  function hl(t) { const e = esc(t); if (!S.q) return e; const q = S.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return e.replace(new RegExp(q, "ig"), m => `<mark>${m}</mark>`); }
  const hay = j => [j.title, j.company, j.summary, ...(j.responsibilities || []), ...(j.requirements || []), ...(j.tools || [])].join(" ").toLowerCase();
  const PALETTE = ["#1F2A5C", "#0A66C2", "#057642", "#B4472B", "#6B3FA0", "#0F6E8C", "#9C2F5A", "#3D5A80", "#7A5C00", "#2F6B3A"];
  const tint = s => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  const DOMAINS = { "Arpeely": "arpeely.com", "StoreNext": "storenext.co.il", "mPrest": "mprest.com", "CrazyLabs": "crazylabs.com", "Artlist": "artlist.io",
    "Cato Networks": "catonetworks.com", "Lusha": "lusha.com", "Team8": "team8.vc", "Earnix": "earnix.com", "Taboola": "taboola.com", "Riverside": "riverside.fm",
    "riverside.fm": "riverside.fm", "Navina": "navina.ai", "Tailor Brands": "tailorbrands.com", "Riskified": "riskified.com", "Stampli": "stampli.com", "SQream": "sqream.com",
    "TradAir": "tradair.com", "Outbrain": "outbrain.com", "Pinecone": "pinecone.io", "Booking.com": "booking.com", "ScyllaDB": "scylladb.com", "Pliops": "pliops.com", "Zerto": "zerto.com" };
  const domainOf = c => { for (const k in DOMAINS) if (c.startsWith(k)) return DOMAINS[k]; return null; };
  const initials = c => { const w = c.replace(/[()&\-–.]/g, " ").split(/\s+/).filter(Boolean); return (w[0][0] + (w[1] ? w[1][0] : "")).toUpperCase(); };
  function logo(j, cls = "") {
    const d = domainOf(j.company), fb = `<span class="logo-fb" style="background:${tint(j.company)}">${esc(initials(j.company))}</span>`;
    return `<span class="logo ${cls}">${fb}${d ? `<img loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=${d}&sz=128" onerror="this.remove()">` : ""}</span>`;
  }
  const yearTag = j => S.reveal ? `<span class="year ${j.era === "new" ? "new" : j.era === "spam" ? "spam" : ""}">${j.era === "spam" ? "רעש" : esc(j.date.slice(0, 4))}</span>` : "";
  const posted = j => S.reveal ? esc(j.date) : "¯\\_(ツ)_/¯";
  const LEVEL_EN = { junior: "Entry level", mid: "Mid-Senior level", senior: "Senior level" };
  const ROLE_EN = { dev: "Engineering", pm: "Product Management", builder: "Builder", other: "Other" };
  function capture(c, pts) {
    const d = document.createElement("div"); d.className = "capture"; d.innerHTML = `<div>+${pts}<small>${c.title} · CAPTURED</small></div>`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 1500);
  }
  function bump() { const e = document.querySelector("#score"); e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump"); }
  function toast(t) { const el = $("#toast"); el.innerHTML = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 3200); }
  const I = {
    bag: '<svg viewBox="0 0 24 24"><path d="M9 4h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2zm0 3h6V6H9z"/></svg>',
    lvl: '<svg viewBox="0 0 24 24"><path d="M4 20h4v-6H4zm6 0h4V9h-4zm6 0h4V4h-4z"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 19h6v2H9z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.4z"/></svg>'
  };
  const mission = () => CH.find(c => c.id === S.active);
  const CAT = { time: "TIME", years: "XP", proto: "PRODUCT", builder: "ROLES", mcp: "TOOLS", spam: "NOISE", degree: "EDU", junior: "ENTRY", cv: "BOSS" };
  const marksOf = id => S.marks[id] || [];
  const totalPts = CH.reduce((a, c) => a + c.pts, 0);
  const score = () => CH.reduce((a, c) => a + (S.best[c.id] || 0), 0);

  /* ---------- sync (multiplayer hook) ---------- */
  function sync(extra) {
    if (!BU.report) return;
    BU.report({ score: score(), missions: S.best, lights: S.lightsUsed, opened: S.opened, searches: S.searches,
      marks: Object.values(S.marks).reduce((a, m) => a + m.length, 0), ...(extra || {}) });
  }
  const syncSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(sync, 1500); }; })();

  /* ---------- filters + list ---------- */
  function pills() {
    const roles = [["all", "כל המשרות"], ["dev", "פיתוח"], ["pm", "ניהול מוצר"], ["builder", "Builder"], ["other", "אחר"]];
    const levels = [["all", "כל הרמות"], ["junior", "ג׳וניור"], ["mid", "מנוסה"], ["senior", "בכיר"]];
    $("#pills").innerHTML = roles.map(([k, v]) => `<button class="pill ${S.role === k ? "on" : ""}" data-role="${k}">${v}</button>`).join("") +
      `<span class="pill-sep"></span>` + levels.map(([k, v]) => `<button class="pill blue ${S.level === k ? "on" : ""}" data-level="${k}">${v}</button>`).join("");
  }
  const filtered = () => JOBS.filter(j => (S.role === "all" || j.role_type === S.role) && (S.level === "all" || j.seniority === S.level) && (!S.q || hay(j).includes(S.q.toLowerCase())));
  function renderList() {
    const list = filtered(), m = mission(), mk = m ? marksOf(m.id) : [];
    $("#count").textContent = list.length;
    if (!list.find(j => j.id === S.sel)) S.sel = list[0] ? list[0].id : null;
    $("#list").innerHTML = list.map(j => `
      <li class="card ${j.id === S.sel ? "sel" : ""} ${mk.includes(j.id) ? "marked" : ""}" data-id="${j.id}">
        ${logo(j)}
        <div>
          <div class="c-title">${hl(j.title)}${yearTag(j)}</div>
          <div class="c-co">${esc(j.company)}</div>
          <div class="c-loc">${esc(j.city || "Tel Aviv")}</div>
          <div class="c-meta">${j.era === "spam" ? '<span class="hot">🔥 Hiring fast</span>' : `<span>${esc(LEVEL_EN[j.seniority] || "")}</span>`}<span>·</span><span>${posted(j)}</span></div>
        </div>
      </li>`).join("") || `<li class="empty">אין משרות שמתאימות לסינון. גם זה קורה בשוק האמיתי.</li>`;
    renderDetail();
  }
  function renderDetail() {
    const j = JOBS.find(x => x.id === S.sel), el = $("#detail");
    if (!j) { el.innerHTML = `<div class="d-empty">בחרו משרה מהרשימה</div>`; return; }
    const m = mission(), canMark = m && m.type === "mark", on = canMark && marksOf(m.id).includes(j.id);
    const li = a => (a || []).map(x => `<li>${hl(x)}</li>`).join("");
    el.innerHTML = `
      <div class="d-cover" style="--c:${tint(j.company)}"></div>
      <div class="d-top">
        <div class="d-head">${logo(j, "logo-lg")}<div><div class="d-co-name">${esc(j.company)}</div><div class="muted en small">${esc(ROLE_EN[j.role_type] || "")}</div></div></div>
        <h1 class="d-title">${esc(j.title)}${yearTag(j)}</h1>
        <div class="d-sub">${esc(j.city || "Tel Aviv")} · ${posted(j)} · Applicants: we stopped counting</div>
        <div class="d-facts">
          <div class="fact">${I.bag}<span class="chip">Full-time</span><span class="chip gray">${esc(LEVEL_EN[j.seniority] || "")}</span></div>
          <div class="fact">${I.lvl}<span>${(j.tools || []).length} כישורים במודעה</span></div>
          <div class="fact">${I.bulb}<span>${j.era === "spam" ? "המודעה הזו מקבלת הרבה קליקים. אולי בגלל הכותרת." : "מגייסים קראו את המודעה הזו יותר פעמים מאשר את קורות החיים שלך."}</span></div>
        </div>
        <div class="d-actions">
          <button class="btn-mark ${on ? "on" : ""}" data-mark="${j.id}" ${canMark ? "" : "disabled title='בחרו קודם משימה בפאנל'"}>${on ? "🚩 מסומנת למשימה" : "🚩 סימון למשימה"}</button>
          <button class="btn-primary" data-open="apply">${I.check} Easy Apply</button>
        </div>
      </div>
      <div class="d-section"><h3>על המשרה</h3>
        <div class="d-ad"><p class="lead">${hl(j.summary || "")}</p>
          <h4>What you'll do</h4><ul>${li(j.responsibilities)}</ul>
          <h4>What we're looking for</h4><ul>${li(j.requirements)}</ul></div></div>
      ${j.tools && j.tools.length ? `<div class="d-section"><h3>כישורים</h3><div class="skills">${j.tools.map(t => `<span class="skill">${hl(t)}</span>`).join("")}</div></div>` : ""}
      <div class="d-section d-about"><h3>על החברה</h3>
        <div class="d-co">${logo(j, "logo-sm")}<div><div class="d-co-name">${esc(j.company)}</div><div class="muted small">${esc(j.city || "Tel Aviv")}</div></div></div>
        <p class="src">מזהה מודעה: <span class="en">${esc(j.id.toUpperCase())}</span>${S.reveal ? (j.source_url ? ` · <a href="${esc(j.source_url)}" target="_blank" rel="noopener">מקור</a>` : " · רעש שנכתב לסדנה") : ""}</p></div>`;
    el.scrollTop = 0;
  }

  /* ---------- game panel ---------- */
  function lightsAvail() {
    const el = S.start ? (Date.now() - S.start) / 60000 : 0;
    return Math.max(0, Math.min(2, 1 + (el >= LIGHT_EVERY ? 1 : 0)) - S.lightsUsed);
  }
  function renderStats() {
    const s = score();
    $("#score").textContent = s; $("#score-total").textContent = "/" + totalPts; $("#score-bar").style.width = (100 * s / totalPts) + "%";
    const a = lightsAvail(), unlocked = Math.min(2, 1 + (S.start && (Date.now() - S.start) / 60000 >= LIGHT_EVERY ? 1 : 0));
    $("#lights").innerHTML = [0, 1].map(i => `<span class="bulb ${i >= S.lightsUsed && i < unlocked ? "on" : ""}"></span>`).join("");
    $("#g-cap").textContent = `${CH.filter(c => (S.best[c.id] || 0) >= c.pts).length}/${CH.length} captured`;
    $("#lights").title = a ? `${a} אורות זמינים` : unlocked < 2 ? "האור הבא נפתח אחרי 10 דקות" : "השתמשתם בשני האורות";
  }
  function renderTiles() {
    $("#tiles").innerHTML = CH.map((c, i) => {
      const b = S.best[c.id] || 0, st = b >= c.pts ? "full" : b > 0 ? "part" : "";
      return `<button class="tile ${S.active === c.id ? "on" : ""} ${st}" data-mission="${c.id}"><span class="t-cat">${String(i + 1).padStart(2, "0")} · ${CAT[c.id] || ""}</span><span class="t-name">${c.short || c.title}</span><span class="t-pts">${b}<small>/${c.pts}</small></span><span class="t-prog" style="width:${100 * b / c.pts}%"></span></button>`;
    }).join("");
  }
  function renderActive() {
    const c = mission(), el = $("#active");
    if (!c) { el.innerHTML = `<div class="a-empty"><b>בחרו משימה.</b>מחפשים, פותחים מודעות, מסמנים 🚩<br>ולוחצים בדיקה.</div>`; return; }
    const b = S.best[c.id] || 0, r = S.res[c.id];
    let body = "";
    if (c.type === "mark") {
      const mk = marksOf(c.id);
      body = `<div class="a-count">${mk.length ? `סימנתם ${mk.length}${c.need ? ` · המשימה מחפשת ${c.need}` : ""}` : `עוד לא סימנתם. פתחו מודעה ולחצו "🚩 סימון למשימה".`}</div>
        <div class="a-marks">${mk.map(id => { const j = JOBS.find(x => x.id === id); return `<span class="mk" data-goto="${id}" title="${esc(j.title)}">${esc(j.company)} ✕</span>`; }).join("")}</div>
        ${r ? `<div class="result ${r.pts >= c.pts ? "full" : r.pts > 0 ? "part" : "zero"}">${r.msg}</div>` : ""}
        ${b >= c.pts ? `<div class="why">${c.why}</div>` : ""}
        <div class="a-actions"><button class="go" data-check="${c.id}" ${mk.length ? "" : "disabled"}>בדיקה</button>
        <button class="go light" data-light="${c.id}" ${lightsAvail() && b < c.pts ? "" : "disabled"}>💡 להדליק אור</button></div>`;
    } else if (c.type === "ats") {
      body = `${b ? `<div class="result full">עברתם את ה-ATS 🚩</div>` : store.get("atsBest", 0) ? `<div class="result part">הציון הכי גבוה שלכם: ${store.get("atsBest", 0)}. צריך 75.</div>` : ""}
        <div class="a-actions"><button class="go" data-open-cv>פתיחת מעבדת קורות החיים</button>
        <button class="go light" data-light="${c.id}" ${lightsAvail() && !b ? "" : "disabled"}>💡 אור</button></div>`;
    }
    el.innerHTML = `<div class="a-top"><div><div class="a-cat">Mission ${String(CH.indexOf(c) + 1).padStart(2, "0")} · ${CAT[c.id] || ""}</div><div class="a-title">${c.title}</div></div><span class="pts">${b}/${c.pts}</span></div><p class="a-prompt">${c.prompt}</p>${body}`;
  }
  function renderGame() { renderStats(); renderTiles(); renderActive(); }

  async function checkMission(c) {
    const mk = marksOf(c.id), hs = H[c.id];
    const correct = mk.filter(id => c.targets.includes(hs[id])).length;
    const wrong = mk.filter(id => !c.targets.includes(hs[id]) && !c.neutral.includes(hs[id])).length;
    const got = Math.min(correct, c.need), pts = Math.max(0, Math.round(c.pts * (got - wrong) / c.need));
    const msg = pts >= c.pts ? `🚩 מושלם! ${got}/${c.need} · ${pts} נק׳` :
      `${got} מתוך ${c.need} נכונות${wrong ? ` · ${wrong} סימונים שגויים מורידים נקודות` : ""} · ${pts} נק׳` + (got < c.need ? " · משהו עוד מסתתר בלוח" : "");
    S.res[c.id] = { pts, msg }; store.set("res", S.res);
    if (pts > (S.best[c.id] || 0)) { S.best[c.id] = pts; store.set("best", S.best); bump(); if (pts >= c.pts) capture(c, pts); }
    renderGame(); sync();
  }
  function useLight(c) {
    if (!lightsAvail()) return;
    S.lightsUsed++; store.set("lightsUsed", S.lightsUsed);
    if (c.type === "ats") { toast("💡 " + c.hint); renderGame(); sync(); return; }
    S.role = "all"; S.level = "all"; S.q = ""; $("#q").value = ""; pills(); renderList();
    const mk = marksOf(c.id), lit = JOBS.filter(j => c.targets.includes(H[c.id][j.id]) && !mk.includes(j.id)).map(j => j.id);
    const wrong = mk.filter(id => !c.targets.includes(H[c.id][id]) && !c.neutral.includes(H[c.id][id]));
    const panes = $(".panes"); panes.classList.add("lights-on");
    lit.forEach(id => { const e = $(`.card[data-id="${id}"]`); if (e) e.classList.add("lit"); });
    const first = lit.length ? $(`.card[data-id="${lit[0]}"]`) : null; if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
    toast(lit.length ? `💡 האור נדלק. ${wrong.length ? "ויש גם צללים בין מה שכבר סימנתם." : ""}` : wrong.length ? "💡 מצאתם את כולן. אבל לא כל מה שסימנתם שייך לכאן." : "💡 אין מה להאיר. הכול כבר אצלכם.");
    setTimeout(() => { panes.classList.remove("lights-on"); $$(".card.lit").forEach(e => e.classList.remove("lit")); }, LIGHT_MS);
    renderGame(); sync();
  }

  /* ---------- timer ---------- */
  function tick() {
    if (BU.eventStart) S.start = BU.eventStart;
    const el = $("#timer");
    if (!S.start) { el.textContent = `${GAME_MIN}:00`; return; }
    const left = Math.max(0, GAME_MIN * 60 - Math.floor((Date.now() - S.start) / 1000));
    el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    el.parentElement.classList.toggle("late", left < 300);
    const unlocked = (Date.now() - S.start) / 60000 >= LIGHT_EVERY;
    if (unlocked && !tick.lit) { tick.lit = true; if (tick.started) toast("💡 נפתח אור שני. השתמשו בחוכמה."); renderStats(); renderActive(); }
    tick.started = true;
    if (left === 0 && !tick.done) { tick.done = true; toast("⏰ הזמן נגמר. מצלמים את הניקוד ועוברים לקיר."); sync({ finished: true }); }
  }

  /* ---------- CV lab / ATS ---------- */
  const TARGETS = ["d4", "b4", "d2", "b1", "d6"].filter(id => JOBS.find(j => j.id === id));
  const SYN = { "ai coding assistants": ["copilot", "cursor", "claude code", "codex", "ai coding"], "llm-based tools": ["llm", "gpt", "claude", "gemini"],
    "agentic development tools": ["agent", "agentic", "claude code", "mcp"], "ai agents": ["agent"], "llm-based workflows": ["llm", "gpt", "claude", "workflow"],
    "ai tools": ["claude", "gpt", "cursor", "copilot", "codex", "lovable", "gemini"], "ai automations": ["automation", "n8n", "zapier"], "node.js": ["node"], "ci/cd": ["ci/cd", "github actions"] };
  const kwHit = (cv, k) => (SYN[k.toLowerCase()] || [k.toLowerCase()]).some(s => cv.includes(s));
  function ats(raw, job) {
    const cv = " " + raw.toLowerCase() + " ", words = raw.trim().split(/\s+/).filter(Boolean).length, L = []; let p = 0;
    const kws = [...new Set(job.tools || [])], hit = kws.filter(k => kwHit(cv, k)), k1 = kws.length ? Math.round(35 * hit.length / kws.length) : 0; p += k1;
    L.push([k1, 35, "התאמה לכישורים", `${hit.length} מתוך ${kws.length}` + (kws.length - hit.length ? ` · חסרים: <span class="en">${esc(kws.filter(k => !hit.includes(k)).slice(0, 4).join(", "))}</span>` : "")]);
    const tool = /(claude|cursor|copilot|codex|gpt|llm|lovable|gemini|agent)/.test(cv), built = /(built|developed|shipped|created|בניתי|פיתחתי|בנינו|פיתחנו)/.test(cv),
      ver = /(test|review|debug|validat|בדיק|בדקתי|ניפוי|תיקנתי)/.test(cv), k2 = (tool && built ? 10 : tool ? 4 : 0) + (ver ? 10 : 0); p += k2;
    L.push([k2, 20, "AI כדרך עבודה", tool ? (ver ? "בונה עם AI ובודקת מה יצא." : "יש כלים, אבל מי בודק את מה שה-AI כתב?") : "אין סימן לעבודה עם AI. ב-2026 זה בולט."]);
    let k3 = 0; if (/(github\.com|http|portfolio)/.test(cv)) k3 += 7; if (/\d+\s*(users|students|%|משתמש|תלמיד)/.test(cv)) k3 += 7; if (/(hackathon|האקתון|project|פרויקט)/.test(cv)) k3 += 6; p += k3;
    L.push([k3, 20, "הוכחות", k3 >= 14 ? "יש לינק ויש מספרים." : "הראו, אל תספרו: לינק, מספר, פרויקט."]);
    const yrs = [...cv.matchAll(/(\d+)\+?\s*(years|year|שנות|שנים)/g)].map(m => +m[1]).filter(n => n >= 2 && n < 40), deg = /(b\.?sc|bachelor|degree|תואר ראשון)/.test(cv);
    let k4, n4; if (yrs.length || deg) { k4 = -25; n4 = "🚨 זוהתה המצאה. ATS לא בודק, אבל המראיין הראשון כן."; }
    else if (/(intern|volunteer|mentor|instructor|מדריכ|חונכ|התנדב)/.test(cv)) { k4 = 15; n4 = "אין שנים, אבל יש ניסיון שמחליף אותן."; } else { k4 = 4; n4 = "המודעה מבקשת ניסיון. מה אצל נועה יכול להחליף אותו?"; }
    p += k4; L.push([k4, 15, "ניסיון", n4]);
    let k5 = 0; if (words >= 60 && words <= 400) k5 += 5; if ((cv.match(/(projects|skills|education|experience|summary|פרויקטים|כישורים|השכלה|ניסיון)/g) || []).length >= 2) k5 += 5; p += k5;
    L.push([k5, 10, "קריאוּת", words < 60 ? "קצר מדי." : words > 400 ? "ארוך מדי. גם ה-ATS נרדם." : "אורך ומבנה סבירים."]);
    if (kws.some(k => cv.split(k.toLowerCase()).length - 1 > 4) || (raw.match(/,/g) || []).length > 45) { p -= 15; L.push([-15, 0, "דחיסת מילות מפתח", "ה-ATS שלנו מכיר את הטריק. −15"]); }
    if (/(ignore (all|previous)|התעלם מכל|system prompt|you are an ats)/.test(cv)) { p -= 20; L.push([-20, 0, "Prompt injection", "ראינו את זה בסיפורי האימה. −20"]); }
    return { score: Math.max(0, Math.min(100, p)), lines: L };
  }
  const CV_TPL = "Noa ___ | Nitzanim graduate | github.com/noa-tutor\n\nSUMMARY\n\n\nPROJECTS\n\n\nEXPERIENCE\n\n\nSKILLS\n\n\nEDUCATION\n";
  function openCV() {
    const t = store.get("cvTarget", TARGETS[0]);
    $("#cv-target").innerHTML = TARGETS.map(id => { const j = JOBS.find(x => x.id === id); return `<option value="${id}" ${id === t ? "selected" : ""}>${esc(j.title)} · ${esc(j.company)}</option>`; }).join("");
    $("#cv-text").value = store.get("cvText", CV_TPL); cvJob(); $("#cvlab").hidden = false;
  }
  function cvJob() {
    const j = JOBS.find(x => x.id === $("#cv-target").value); store.set("cvTarget", j.id);
    $("#cv-job").innerHTML = `<div class="d-co" style="display:flex;gap:10px;align-items:center">${logo(j, "logo-sm")}<div><div class="d-co-name en">${esc(j.title)}</div><div class="muted en small">${esc(j.company)}</div></div></div>
      <ul class="en small">${(j.requirements || []).slice(0, 6).map(r => `<li>${esc(r)}</li>`).join("")}</ul><div class="skills" style="margin-top:6px">${(j.tools || []).map(t => `<span class="skill">${esc(t)}</span>`).join("")}</div>`;
  }
  function runATS() {
    const j = JOBS.find(x => x.id === $("#cv-target").value), cv = $("#cv-text").value; store.set("cvText", cv);
    const r = ats(cv, j), pass = r.score >= 75; store.set("atsBest", Math.max(store.get("atsBest", 0), r.score));
    $("#cv-result").innerHTML = `<div class="gauge ${pass ? "pass" : r.score >= 50 ? "mid" : "fail"}" style="--p:${r.score}"><div><b>${r.score}</b><small>/100</small></div></div>
      <div class="verdict">${pass ? "✅ עברתם את ה-ATS. עכשיו רק צריך שבן אדם יקרא." : r.score >= 50 ? "🟡 כמעט. ה-ATS מהסס, כמו מגייס ביום ראשון בבוקר." : "❌ נדחה אוטומטית. בלי מייל, כמו באמת."}</div>
      <ul class="breakdown">${r.lines.map(([p, max, t, n]) => `<li class="${p < 0 ? "neg" : ""}"><div class="bd-top"><b>${t}</b><span class="en">${p}${max ? " / " + max : ""}</span></div>${max ? `<div class="bd-bar"><i style="width:${Math.max(0, 100 * p / max)}%"></i></div>` : ""}<div class="muted small">${n}</div></li>`).join("")}</ul>`;
    const c = CH.find(x => x.type === "ats");
    if (pass && c && !(S.best[c.id] >= c.pts)) { S.best[c.id] = c.pts; store.set("best", S.best); bump(); capture(c, c.pts); renderGame(); }
    sync({ ats: r.score });
  }

  /* ---------- intro / join ---------- */
  function startGame() {
    if (!S.start) { S.start = Date.now(); store.set("start", S.start); }
    $("#intro").hidden = true; store.set("intro", 1); tick(); renderGame(); sync();
  }
  BU.startGame = startGame;

  /* ---------- events ---------- */
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-close]") || t.classList.contains("modal")) { if (t.closest("#intro") || t.id === "intro") return; (t.closest(".modal") || t).hidden = true; return; }
    const tg = t.closest("[data-toast]"); if (tg) { e.preventDefault(); toast(tg.dataset.toast); return; }
    const card = t.closest(".card"); if (card) { S.sel = card.dataset.id; S.opened++; store.set("opened", S.opened); renderList(); syncSoon(); return; }
    const go = t.closest("[data-goto]");
    if (go) { if (t.closest(".mk") && e.offsetX < 18) {} S.role = "all"; S.level = "all"; S.q = ""; $("#q").value = ""; S.sel = go.dataset.goto; pills(); renderList();
      const el = $(`.card[data-id="${S.sel}"]`); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    const mm = t.closest("[data-mark]");
    if (mm) { const c = mission(); if (!c || c.type !== "mark") return; const id = mm.dataset.mark, m = marksOf(c.id);
      S.marks[c.id] = m.includes(id) ? m.filter(x => x !== id) : [...m, id]; store.set("marks", S.marks); renderList(); renderActive(); syncSoon(); return; }
    const ms = t.closest("[data-mission]"); if (ms) { S.active = ms.dataset.mission; store.set("active", S.active); renderGame(); renderList(); return; }
    const pr = t.closest("[data-role]"); if (pr) { S.role = pr.dataset.role; pills(); renderList(); return; }
    const pl = t.closest("[data-level]"); if (pl) { S.level = pl.dataset.level; pills(); renderList(); return; }
    const ck = t.closest("[data-check]"); if (ck) { checkMission(CH.find(c => c.id === ck.dataset.check)); return; }
    const lg = t.closest("[data-light]"); if (lg) { useLight(CH.find(c => c.id === lg.dataset.light)); return; }
    const op = t.closest("[data-open]"); if (op) { e.preventDefault(); $("#" + op.dataset.open).hidden = false; return; }
    if (t.closest("[data-open-cv]")) { openCV(); return; }
    if (t.closest("#cv-run")) { runATS(); return; }
    if (t.closest("#cv-reset")) { $("#cv-text").value = CV_TPL; return; }
    if (t.closest("[data-start]")) { if (BU.beforeStart) BU.beforeStart(); else startGame(); return; }
    if (t.closest("#how-btn")) { $("#intro").hidden = false; return; }
    if (t.closest("#final-btn")) { $("#final-title").textContent = FINAL.title; $("#final-prompt").textContent = FINAL.prompt; $("#final-text").value = store.get("final", ""); $("#final").hidden = false; return; }
    if (t.closest("#reset")) { const b = $("#reset"); if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "בטוח? לחצו שוב"; return; }
      Object.keys(localStorage).filter(k => k.startsWith("bujl:")).forEach(k => localStorage.removeItem(k)); location.reload(); }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $$(".modal").forEach(m => { if (m.id !== "intro") m.hidden = true; }); });
  document.addEventListener("input", e => { if (e.target.id === "cv-text") store.set("cvText", e.target.value); if (e.target.id === "final-text") store.set("final", e.target.value); });
  document.addEventListener("change", e => { if (e.target.id === "cv-target") cvJob(); });
  let qT; $("#q").addEventListener("input", e => { S.q = e.target.value.trim(); renderList(); clearTimeout(qT); qT = setTimeout(() => { if (S.q) { S.searches++; store.set("searches", S.searches); syncSoon(); } }, 800); });

  prepHashes().then(() => {
    pills(); renderList(); renderGame(); tick(); setInterval(tick, 1000);
    if (!store.get("intro", null)) $("#intro").hidden = false;
    if (BU.ready) BU.ready();
  });
})();
