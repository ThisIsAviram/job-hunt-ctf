(function () {
  const JOBS = window.JOBS || [];
  const CH = window.CHALLENGES || [];
  const SALT = "nitzanim-2030";
  const $ = (s, el = document) => el.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tjl:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("tjl:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  let state = { role: "all", level: "all", q: "", onlyMarked: false, reveal: false,
    marked: store.get("marked", []), solved: store.get("solved", {}), team: store.get("team", "") };

  const ROLE = { all: "הכול", dev: "פיתוח", pm: "ניהול מוצר", builder: "Builder", other: "אחר" };
  const LEVEL = { all: "כל הרמות", junior: "ג׳וניור", mid: "מנוסה", senior: "בכיר" };
  const COLORS = ["#0B5FFF", "#7A3EF0", "#0E8A5F", "#D9480F", "#0A2A66", "#C2255C", "#1971C2", "#5F3DC4", "#2B8A3E", "#E67700"];
  const norm = s => String(s).trim().toLowerCase().replace(/[\s"'׳״.\-_,]+/g, "");
  async function sha(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function hl(text) {
    const t = esc(text);
    if (!state.q) return t;
    const q = state.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return t.replace(new RegExp(q, "ig"), m => `<mark>${m}</mark>`);
  }
  const hay = j => [j.title, j.company, j.summary, ...(j.responsibilities || []), ...(j.requirements || []), ...(j.tools || [])].join(" ").toLowerCase();
  const color = j => COLORS[[...j.company].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const yearPill = j => state.reveal ? `<span class="year-pill ${j.era === "new" ? "new" : ""}">${j.date.slice(0, 4)}</span>` : "";

  function chips(id, map, key) {
    const el = $(id);
    el.innerHTML = Object.entries(map).filter(([k]) => k === "all" || JOBS.some(j => (key === "role" ? j.role_type : j.seniority) === k))
      .map(([k, v]) => `<button class="chip ${state[key] === k ? "on" : ""}" data-k="${k}">${v}</button>`).join("");
    el.onclick = e => { const b = e.target.closest(".chip"); if (!b) return; state[key] = b.dataset.k; chips(id, map, key); render(); };
  }

  function render() {
    const q = state.q.toLowerCase();
    const list = JOBS.filter(j => (state.role === "all" || j.role_type === state.role) &&
      (state.level === "all" || j.seniority === state.level) &&
      (!q || hay(j).includes(q)) && (!state.onlyMarked || state.marked.includes(j.id)));
    $("#count").textContent = list.length;
    $("#feed").innerHTML = list.map(j => `
      <article class="job" data-id="${j.id}">
        <div class="avatar" style="background:${color(j)}">${esc(j.company[0])}</div>
        <div>
          <h4>${hl(j.title)}${yearPill(j)}</h4>
          <div class="meta">${esc(j.company)} · ${esc(j.city || "Tel Aviv")} · <span title="התאריך הוסתר">Posted: ${state.reveal ? esc(j.date) : "¯\\_(ツ)_/¯"}</span></div>
          <div class="tags">${(j.tools || []).slice(0, 7).map(t => `<span class="tag">${hl(t)}</span>`).join("")}</div>
        </div>
        <button class="star ${state.marked.includes(j.id) ? "on" : ""}" data-star="${j.id}" title="סימון">${state.marked.includes(j.id) ? "★" : "☆"}</button>
      </article>`).join("") || `<p class="hint">אין משרות שמתאימות לסינון.</p>`;
  }

  function openJob(id) {
    const j = JOBS.find(x => x.id === id); if (!j) return;
    const li = a => (a || []).map(x => `<li>${hl(x)}</li>`).join("");
    $("#job-sheet").innerHTML = `<button class="close" data-close>×</button>
      <div class="ad">
        <h2>${esc(j.title)}${yearPill(j)}</h2>
        <div class="meta" style="text-align:left">${esc(j.company)} · ${esc(j.city || "Tel Aviv")} · Posted: ${state.reveal ? esc(j.date) : "¯\\_(ツ)_/¯ (that's the whole game)"}</div>
        <p>${hl(j.summary || "")}</p>
        <h3>What you'll do</h3><ul>${li(j.responsibilities)}</ul>
        <h3>What we're looking for</h3><ul>${li(j.requirements)}</ul>
        ${j.tools && j.tools.length ? `<h3>Stack & tools</h3><div class="tags" style="justify-content:flex-start">${j.tools.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="src">Ad ID: ${esc(j.id.toUpperCase())}${state.reveal ? ` · <a href="${esc(j.source_url)}" target="_blank" rel="noopener">original source</a>` : ""}</div>
      </div>`;
    $("#job-modal").hidden = false;
  }

  function scoreNow() {
    const s = CH.reduce((a, c) => a + (state.solved[c.id] ? c.pts : 0), 0);
    $("#score").textContent = s + " / " + CH.reduce((a, c) => a + c.pts, 0);
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 2600); }

  function chHTML(c, i) {
    const solved = state.solved[c.id];
    let body = "";
    if (solved) {
      body = `<div class="flag">${solved}</div>${c.why ? `<div class="why">${c.why}</div>` : ""}`;
    } else if (c.type === "open") {
      body = `<textarea id="in-${c.id}" rows="4" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit" placeholder="Nitzanim graduate, 2030…">${esc(store.get("open:" + c.id, ""))}</textarea><div class="hint-text">נשמר רק אצלכם. מעתיקים לפתק ומדביקים על הקיר.</div>`;
    } else if (c.type === "choice") {
      body = `<div class="opts">${c.options.map((o, k) => `<button class="opt" data-ch="${c.id}" data-opt="${k}">${o}</button>`).join("")}</div>`;
    } else if (c.type === "classify") {
      const picks = store.get("cl:" + c.id, {});
      body = `<div class="classify">${c.items.map(id => { const j = JOBS.find(x => x.id === id);
        return `<div class="cl-row"><a data-open-job="${id}">${esc(j ? j.title : id)} · ${esc(j ? j.company : "")}</a>
        <div class="seg" data-cl="${c.id}" data-item="${id}">${c.labels.map(l => `<button class="${picks[id] === l ? "on" : ""}" data-v="${l}">${l}</button>`).join("")}</div></div>`; }).join("")}</div>
        <button class="go" data-submit="${c.id}">בדיקה</button>`;
    } else {
      body = `<div class="row"><input type="text" id="in-${c.id}" placeholder="${c.placeholder || "התשובה"}"><button class="go" data-submit="${c.id}">שליחה</button></div>`;
    }
    return `<li class="ch ${solved ? "solved" : ""}" id="ch-${c.id}">
      <div class="ch-top"><span class="ch-title">${i + 1}. ${c.title}</span><span class="pts">${c.type === "open" ? "בונוס לחדר" : (solved ? "✓ " : "") + c.pts + " נק׳"}</span></div>
      <p>${c.prompt}</p>${body}
      ${!solved && c.hint ? `<button class="hint-btn" data-hint="${c.id}">רמז (לא מוריד נקודות, רק כבוד)</button><div class="hint-text" id="hint-${c.id}" hidden>${c.hint}</div>` : ""}
      <div class="err" id="err-${c.id}"></div></li>`;
  }
  function renderCH() { $("#challenges").innerHTML = CH.map(chHTML).join(""); scoreNow(); }

  async function check(c, answer) {
    const h = await sha(SALT + ":" + c.id + ":" + answer);
    if (c.answers.includes(h)) {
      const flag = "NTZ{" + (await sha(h + "flag")).slice(0, 10) + "}";
      state.solved[c.id] = flag; store.set("solved", state.solved);
      renderCH(); toast(`🚩 ${c.title}: +${c.pts}`);
    } else {
      $("#err-" + c.id).textContent = c.type === "classify" ? "לא הכול נכון. גם המגייסים טועים, אבל אתם יכולים לנסות שוב." : "לא זה. קראו את המודעה, לא רק את הכותרת (טיפ שהמגייסים היו שמחים שתקבלו).";
    }
  }

  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-close]") || t.classList.contains("modal")) { t.closest(".modal").hidden = true; return; }
    const star = t.closest("[data-star]");
    if (star) { e.stopPropagation(); const id = star.dataset.star; state.marked = state.marked.includes(id) ? state.marked.filter(x => x !== id) : [...state.marked, id]; store.set("marked", state.marked); render(); return; }
    const oj = t.closest("[data-open-job]"); if (oj) { openJob(oj.dataset.openJob); return; }
    const job = t.closest(".job"); if (job) { openJob(job.dataset.id); return; }
    const op = t.closest("[data-open]"); if (op) { e.preventDefault(); $("#" + op.dataset.open).hidden = false; return; }
    const hb = t.closest("[data-hint]"); if (hb) { $("#hint-" + hb.dataset.hint).hidden = false; hb.remove(); return; }
    const opt = t.closest("[data-opt]"); if (opt) { const c = CH.find(x => x.id === opt.dataset.ch); check(c, String(opt.dataset.opt)); return; }
    const seg = t.closest(".seg button");
    if (seg) { const s = seg.parentElement; const picks = store.get("cl:" + s.dataset.cl, {}); picks[s.dataset.item] = seg.dataset.v; store.set("cl:" + s.dataset.cl, picks);
      [...s.children].forEach(b => b.classList.toggle("on", b === seg)); return; }
    const sub = t.closest("[data-submit]");
    if (sub) { const c = CH.find(x => x.id === sub.dataset.submit);
      if (c.type === "classify") { const picks = store.get("cl:" + c.id, {}); check(c, c.items.map(id => picks[id] || "?").join("|")); }
      else { check(c, norm($("#in-" + c.id).value)); } return; }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach(m => m.hidden = true);
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.id && e.target.id.startsWith("in-")) { const c = CH.find(x => "in-" + x.id === e.target.id); check(c, norm(e.target.value)); }
  });
  document.addEventListener("input", e => { if (e.target.tagName === "TEXTAREA" && e.target.id.startsWith("in-")) store.set("open:" + e.target.id.slice(3), e.target.value); });
  $("#q").addEventListener("input", e => { state.q = e.target.value.trim(); render(); });
  $("#only-marked").addEventListener("change", e => { state.onlyMarked = e.target.checked; render(); });
  $("#reset").onclick = () => { if (!$("#reset").dataset.armed) { $("#reset").dataset.armed = 1; $("#reset").textContent = "בטוח? לחצו שוב"; return; }
    state.solved = {}; state.marked = []; store.set("solved", {}); store.set("marked", []); CH.forEach(c => store.set("cl:" + c.id, {}));
    $("#reset").textContent = "איפוס"; delete $("#reset").dataset.armed; renderCH(); render(); };
  $("#reveal-btn").onclick = () => { state.reveal = !state.reveal; $("#reveal-btn").textContent = state.reveal ? "הסתר תאריכים" : "מצב מנחה"; render(); };
  if (new URLSearchParams(location.search).has("reveal")) { state.reveal = true; $("#reveal-btn").textContent = "הסתר תאריכים"; }

  chips("#chips-role", ROLE, "role"); chips("#chips-level", LEVEL, "level");
  render(); renderCH();
})();
