// ============================================================================
// app.js — Master's Dashboard. Decrypts the data blob, renders 8 tabs,
// persists the user's edits (statuses, stars, notes, checkmarks) in localStorage.
// ============================================================================

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // PASSWORD LOCK SWITCH
  // The lock screen is currently DISABLED — the dashboard opens straight away.
  // To turn the password back on in future, set LOCK_ENABLED = true (and, if you
  // want a different password, re-encrypt the data with tools/encrypt.html).
  // All the lock + encryption code below is kept intact for that purpose.
  // ---------------------------------------------------------------------------
  const LOCK_ENABLED = false;
  const AUTO_PASSWORD = "Gin1122!!"; // used only to auto-open when LOCK_ENABLED is false

  const STATE_KEY = "md_state_v1";
  const KEY_KEY = "md_key_v1";
  const STATUSES = ["Not started", "Researching", "Drafting", "Submitted", "Interview", "Offer", "Rejected", "Declined"];
  const SUMMER_STATUSES = ["Probing", "Confirmed", "Declined", "Chosen ✓", "Optional"];

  let DATA = null;
  let state = loadState();

  // ------------------------------------------------------------ utilities
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  function daysUntil(iso) { return Math.round((parseISO(iso) - today()) / 86400000); }
  function fmtDate(iso) {
    return parseISO(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtToday() {
    return today().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; }
  }
  function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  function progState(id) {
    state.programs = state.programs || {};
    state.programs[id] = state.programs[id] || {};
    return state.programs[id];
  }

  // Tier vocab (v2): REACH | OPTIMISTIC MATCH | REALISTIC MATCH | LIKELY | DUAL
  const TIERS = ["REACH", "OPTIMISTIC MATCH", "REALISTIC MATCH", "LIKELY"];
  function tierClass(t) {
    return { "REACH": "reach", "OPTIMISTIC MATCH": "match", "REALISTIC MATCH": "realistic", "LIKELY": "likely", "DUAL": "dual" }[t] || "neutral";
  }
  function tierLabel(t) {
    return { "OPTIMISTIC MATCH": "OPT. MATCH", "REALISTIC MATCH": "REAL. MATCH", "DUAL": "DUAL-DEGREE" }[t] || t;
  }
  function prlOn() {
    const f = state.filters || {};
    return f.prl === undefined ? true : !!f.prl; // PRL assumed ON by default — it's the plan
  }

  function verdictBadge(v) {
    if (v === "clear") return '<span class="badge ok">You clear it ✓</span>';
    if (v === "borderline") return '<span class="badge warn">Borderline — check conversion</span>';
    if (v === "competitive") return '<span class="badge bad">No wall, but competitive</span>';
    return '<span class="badge neutral">No published cutoff</span>';
  }

  function deadlineChip(p) {
    if (!p.deadlineSort) return `<span class="deadline-chip">${esc(p.deadline)}</span>`;
    const d = daysUntil(p.deadlineSort);
    const cls = d < 0 ? "past" : (d <= 45 ? "soon" : "");
    const rel = d < 0 ? "passed" : (d === 0 ? "today!" : `in ${d}d`);
    const approx = p.deadlineEstimate ? "~" : "";
    return `<span class="deadline-chip ${cls}">${esc(p.deadline)} · ${approx}${rel}</span>`;
  }

  // Compact deadline chip for the collapsed banner: short date (from deadlineSort) + countdown.
  function deadlineMini(o) {
    if (!o.deadlineSort) return "";
    const d = daysUntil(o.deadlineSort);
    const cls = d < 0 ? "past" : (d <= 45 ? "soon" : "");
    const rel = d < 0 ? "passed" : (d === 0 ? "today" : `in ${d}d`);
    const approx = o.deadlineEstimate ? "~" : "";
    return `<span class="ub-dl ${cls}"><span class="ub-dl-date">${approx}${fmtDate(o.deadlineSort)}</span><span class="ub-dl-rel">${rel}</span></span>`;
  }

  // Full, clear deadline block (non-EU / international) from o.deadlineDetail.
  function deadlineBlock(o) {
    const d = o.deadlineDetail;
    const chip = deadlineChip(o);
    if (!d) return `<div class="prog-block deadline-block"><span class="blk-label">Deadline — non-EU / international</span>${chip}</div>`;
    const row = (k, v) => v ? `<div class="dl-row"><span class="dl-k">${k}</span> ${esc(v)}</div>` : "";
    return `
      <div class="prog-block deadline-block">
        <span class="blk-label">Deadline — non-EU / international</span>
        <div class="dl-headline">${esc(d.nonEU)}</div>
        ${row("Opens", d.opens)}
        ${row("Earliest / scholarship", d.earliest)}
        ${row("Visa", d.visa)}
        <div class="dl-foot">${chip}${d.verified ? ` · <span class="tiny">${esc(d.verified)}</span>` : ""}</div>
        ${d.cycle ? `<div class="tiny" style="margin-top:3px;">${esc(d.cycle)}</div>` : ""}
      </div>`;
  }

  // ------------------------------------------------------------ cost / score / toggle helpers
  function euMode() { return (state.filters && state.filters.euStatus) === "eu" ? "eu" : "nonEu"; }
  function scholarshipOn() { return !!(state.filters && state.filters.scholarship); }
  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function eur(n) { return isNum(n) ? "€" + n.toLocaleString("en-GB") : esc(String(n == null || n === "" ? "—" : n)); }
  function activeTotal(o) { const c = o.costs || {}; return euMode() === "eu" ? c.euTotal : c.nonEuTotal; }
  function activeTuition(o) { const c = o.costs || {}; return euMode() === "eu" ? c.euTuition : c.nonEuTuition; }
  function admissionMid(p) { const m = p.oddsMid || {}; return prlOn() ? m.withPRL : m.noPRL; }
  function totalSortKey(o) { const t = activeTotal(o); return isNum(t) ? t : Infinity; } // "Verify"/"N/A" sort last

  // Conservative: only return a number when the workbook text states a clear per-year EUR award.
  function parseAnnualEur(text) {
    const s = String(text || "");
    let m = s.match(/EUR\s*([\d.]+)\s*k\s*(?:\/|per\s*)?\s*(?:year|yr|annum|p\.?a\.?)/i);
    if (m) return Math.round(parseFloat(m[1]) * 1000);
    m = s.match(/EUR\s*([\d,]+)\s*(?:\/|per\s*)?\s*(?:year|yr|annum|p\.?a\.?)/i);
    if (m) return Math.round(parseFloat(m[1].replace(/,/g, "")));
    return null;
  }
  // Net yearly cost after the best clearly-quantified award (never invents; null when no clean figure).
  function scholarshipNet(o) {
    if (!scholarshipOn()) return null;
    const t = activeTotal(o);
    if (!isNum(t)) return null;
    let best = null;
    for (const a of ((o.scholarship && o.scholarship.awards) || [])) {
      const v = parseAnnualEur(a.amount);
      if (isNum(v)) best = best === null ? v : Math.max(best, v);
    }
    const mv = parseAnnualEur(o.scholarship && o.scholarship.maxFunding);
    if (isNum(mv)) best = best === null ? mv : Math.max(best, mv);
    return isNum(best) ? Math.max(0, t - best) : null;
  }

  // 1–5 score bars (higher = better; housingEase already inverted from housing risk).
  const SCORE_DEFS = [
    ["fit", "Fit"], ["prestige", "Prestige (QS)"], ["career", "Career options"],
    ["connectivity", "Getting home"], ["prereqSafety", "Prereq safety"],
    ["housingEase", "Housing ease"], ["scholarshipUpside", "Funding upside"]
  ];
  function scoresChart(o) {
    const sc = o.scores;
    if (!sc) return "";
    const rows = SCORE_DEFS.filter(([k]) => isNum(sc[k])).map(([k, label]) => {
      const v = sc[k], pct = Math.round(v / 5 * 100);
      return `<div class="scorebar"><span class="sb-label">${label}</span>
        <span class="sb-track"><i data-w="${pct}"></i></span><span class="sb-val">${v}</span></div>`;
    }).join("");
    return `<div class="prog-block"><span class="blk-label">Scores (1–5, higher is better)</span>
      <div class="scorebars">${rows}</div></div>`;
  }

  // Stacked tuition-vs-living bar; only when the active total is a real number.
  function costBar(o) {
    const c = o.costs || {}, total = activeTotal(o);
    if (!isNum(total) || total <= 0) return "";
    const living = isNum(c.annualLiving) ? Math.min(c.annualLiving, total) : 0;
    const tp = Math.round((total - living) / total * 100), lp = 100 - tp;
    return `<div class="cost-bar"><i class="cb-tuition" data-w="${tp}"></i><i class="cb-living" data-w="${lp}"></i></div>
      <div class="cost-bar-legend"><span><b class="dot tuition"></b>Tuition ${tp}%</span><span><b class="dot living"></b>Living ${lp}%</span></div>`;
  }

  function costDetail(o) {
    const c = o.costs;
    if (!c || (c.euTotal === undefined && c.nonEuTotal === undefined)) return "";
    const net = scholarshipNet(o), eu = euMode() === "eu";
    return `<div class="prog-block cost-detail">
      <span class="blk-label">Yearly cost — ${eu ? "EU/EEA status" : "non-EU status"}${c.confidence ? ` · <span class="conf">${esc(c.confidence)}</span>` : ""}</span>
      <div class="cost-headline"><span class="metric-num">${eur(activeTotal(o))}</span><span class="ml">/yr</span>
        ${net !== null ? `<span class="net">≈ ${eur(net)}/yr with best realistic award <span class="tiny">(conditional — verify)</span></span>` : ""}</div>
      ${costBar(o)}
      <div class="cost-grid">
        <span>Rent</span><span>${isNum(c.rentMo) ? eur(c.rentMo) + "/mo" : esc(c.rentMo || "—")}</span>
        <span>Other living</span><span>${isNum(c.otherMo) ? eur(c.otherMo) + "/mo" : esc(c.otherMo || "—")}</span>
        <span>Annual living</span><span>${eur(c.annualLiving)}</span>
        <span>EU total</span><span>${eur(c.euTotal)}</span>
        <span>Non-EU total</span><span>${eur(c.nonEuTotal)}</span>
      </div>
      <div class="cost-tuition"><b>${eu ? "EU/EEA" : "Non-EU"} tuition:</b> ${esc(activeTuition(o) || "—")}</div>
      ${c.notes ? `<div class="tiny" style="margin-top:6px;">${esc(c.notes)}</div>` : ""}
      <div class="prog-links" style="margin-top:6px;">
        ${/^https?:/.test(c.feeSource || "") ? `<a href="${esc(c.feeSource)}" target="_blank" rel="noopener">Fee source ↗</a>` : ""}
        ${/^https?:/.test(c.livingSource || "") ? `<a href="${esc(c.livingSource)}" target="_blank" rel="noopener">Living source ↗</a>` : ""}
      </div>
    </div>`;
  }

  function scholarshipDetail(o) {
    const s = o.scholarship;
    if (!s || !s.bestRealistic) return "";
    const awards = s.awards || [];
    return `<div class="prog-block">
      <span class="blk-label">Scholarships — upside ${esc(String(s.upside1to5 ?? "?"))}/5 · difficulty ${esc(String(s.difficulty1to5 ?? "?"))}/5${s.confidence ? ` · ${esc(s.confidence)}` : ""}</span>
      <div><b>Best realistic:</b> ${esc(s.bestRealistic)}</div>
      ${s.bestStretch ? `<div><b>Stretch:</b> ${esc(s.bestStretch)}</div>` : ""}
      <div class="tiny" style="margin-top:4px;">${esc(s.realismNote || "")}${s.netCost ? " " + esc(s.netCost) : ""}</div>
      ${awards.length ? `<details class="awards"><summary class="tiny">${awards.length} award${awards.length > 1 ? "s" : ""} researched</summary>
        ${awards.map(a => `<div class="award"><b>${esc(a.name)}</b> — ${esc(a.amount)}
          <div class="tiny">${esc(a.oddsBand)} odds · difficulty ${esc(String(a.difficulty))}/5 · ${esc(a.eligibility)}</div>
          ${/^https?:/.test(a.url || "") ? `<a class="tiny" href="${esc(a.url)}" target="_blank" rel="noopener">apply ↗</a>` : ""}</div>`).join("")}
      </details>` : ""}
    </div>`;
  }

  function housingDetail(o) {
    const h = o.housing;
    if (!h || !h.label) return "";
    return `<div class="prog-block">
      <span class="blk-label">Housing — ${esc(h.label)} (risk ${esc(String(h.score1to5))}/5)</span>
      ${esc(h.evidence || "")}
      <div class="tiny" style="margin-top:4px;">Start searching: ${esc(h.leadTime || "—")}${h.isolation ? " · " + esc(h.isolation) : ""}</div>
    </div>`;
  }

  // Shared EU/non-EU + PRL + scholarship toggles (used on Programmes and Compare).
  function toggleBar() {
    const prl = prlOn(), eu = euMode() === "eu", sch = scholarshipOn();
    return `<div class="toggle-row">
      <button class="toggle-btn ${eu ? "on" : ""}" data-filter-toggle="euStatus" title="Switch tuition between EU/EEA and non-EU rates">${eu ? "EU/EEA fees" : "Non-EU fees"}</button>
      <button class="toggle-btn prl-toggle ${prl ? "on" : ""}" data-filter-toggle="prlflip" title="${esc(DATA.oddsInfo.prlMeaning)}">PRL ${prl ? "ON · lab project" : "OFF · no lab"}</button>
      <button class="toggle-btn ${sch ? "on" : ""}" data-filter-toggle="scholarship" title="Show net cost after the best clearly-quantified award, where one exists">Scholarship ${sch ? "on" : "off"}</button>
    </div>`;
  }

  // ------------------------------------------------------------ animation (reduced-motion aware)
  function fmtNum(n) { return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1); }
  function prefersReduce() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function animateNum(el, to, dur) {
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * k); // ease in-out
      el.textContent = fmtNum(to * e);
      if (k < 1) requestAnimationFrame(step); else el.textContent = fmtNum(to);
    })(t0);
  }
  function animateBars(scope, reduce) {
    $$(".scorebar i[data-w], .cost-bar i[data-w]", scope).forEach(i => {
      const w = i.dataset.w + "%";
      if (reduce) { i.style.width = w; return; }
      i.style.width = "0%";
      requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = w; }));
    });
  }
  // Post-render: count-ups, bar growth for open cards, and details open-state persistence.
  function enhance(root) {
    const reduce = prefersReduce();
    $$("[data-countup]", root).forEach(el => {
      const target = parseFloat(el.dataset.countup);
      if (!isFinite(target)) return;
      if (reduce) { el.textContent = fmtNum(target); return; }
      animateNum(el, target, 650);
    });
    $$("details.uni[open]", root).forEach(d => animateBars(d, reduce));
    $$("details.uni", root).forEach(d => {
      d.addEventListener("toggle", () => {
        state.expanded = state.expanded || {};
        if (d.open) { state.expanded[d.dataset.uni] = true; animateBars(d, reduce); }
        else delete state.expanded[d.dataset.uni];
        saveState();
      });
    });
  }

  // ------------------------------------------------------------ unlock flow
  async function tryRememberedKey() {
    const raw = localStorage.getItem(KEY_KEY);
    if (!raw) return false;
    try {
      const key = await DashCrypto.importKey(raw);
      DATA = await DashCrypto.decryptWithKey(ENCRYPTED_DATA, key);
      return true;
    } catch {
      localStorage.removeItem(KEY_KEY);
      return false;
    }
  }

  async function unlock(password, remember) {
    const { data, key } = await DashCrypto.decryptJson(ENCRYPTED_DATA, password);
    DATA = data;
    if (remember) localStorage.setItem(KEY_KEY, await DashCrypto.exportKey(key));
  }

  let mainBound = false;
  function showApp() {
    // Render the app FIRST, while the lock screen is still visible. Only reveal
    // it once rendering has succeeded — that way a render error can never leave
    // a blank page (the lock + its error message stay on screen instead).
    $("#topbar-date").textContent = fmtToday();
    $("#footer-note").textContent = DATA.meta.note;
    if (!mainBound) { bindMain(); mainBound = true; }
    switchTab(state.tab || "overview");
    $("#app").hidden = false;
    $("#lock").hidden = true;
  }

  $("#lock-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#lock-btn");
    btn.disabled = true; btn.textContent = "Unlocking…";
    $("#lock-error").hidden = true;
    try {
      await unlock($("#lock-pass").value, $("#lock-remember").checked);
      showApp();
    } catch (err) {
      console.error("Unlock failed:", err);
      const el = $("#lock-error");
      // A decryption failure (wrong password) surfaces as an OperationError.
      // Anything else is a real bug we want to see, not hide behind "wrong password".
      const wrongPass = err && (err.name === "OperationError" || err.name === "InvalidAccessError");
      el.textContent = wrongPass
        ? "Wrong password — try again."
        : "Something went wrong opening the dashboard: " + (err && err.message ? err.message : err);
      el.hidden = false;
      $("#lock-pass").value = "";
      $("#lock-pass").focus();
    } finally {
      btn.disabled = false; btn.textContent = "Unlock";
    }
  });

  // ------------------------------------------------------------ top bar
  $("#btn-lock").addEventListener("click", () => {
    localStorage.removeItem(KEY_KEY);
    location.reload();
  });

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ exportedOn: new Date().toISOString(), state }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `masters-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj.state || typeof obj.state !== "object") throw new Error("bad file");
        state = obj.state;
        saveState();
        switchTab(state.tab || "overview");
        alert("Backup restored.");
      } catch {
        alert("That file doesn't look like a dashboard backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // ------------------------------------------------------------ tabs
  $("#tabs").addEventListener("click", e => {
    const btn = e.target.closest(".tab");
    if (btn) switchTab(btn.dataset.tab);
  });

  let lastTab = null;
  function switchTab(tab) {
    const sameTab = tab === lastTab;
    const keepY = window.scrollY;
    lastTab = tab;
    state.tab = tab; saveState();
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    const render = {
      overview: renderOverview, programs: renderPrograms, reserves: renderReserves, cities: renderCities,
      timeline: renderTimeline, checklist: renderChecklist, summer: renderSummer,
      profile: renderProfile, strategy: renderStrategy, compare: renderCompare
    }[tab] || renderOverview;
    $("#main").innerHTML = render();
    enhance($("#main"));
    window.scrollTo(0, sameTab ? keepY : 0);
  }

  // ------------------------------------------------------------ OVERVIEW
  function renderOverview() {
    const g = DATA.gpa;
    const tiers = {};
    DATA.programs.forEach(p => { tiers[p.tier] = (tiers[p.tier] || 0) + 1; });
    const tierBadges = TIERS.filter(t => tiers[t])
      .map(t => `<span class="badge ${tierClass(t)}">${tiers[t]} ${tierLabel(t).toLowerCase()}</span>`).join(" ")
      + (tiers.DUAL ? ` <span class="badge dual">+ dual-degree</span>` : "");
    const starred = DATA.programs.filter(p => progState(p.id).star).length;

    const summerDays = daysUntil(DATA.summer.decisionDate);
    const summerCard = summerDays >= -10 ? `
      <div class="card stat ${summerDays <= 10 ? "urgent" : ""}">
        <div class="stat-label">Summer decision</div>
        <div class="stat-value">${summerDays >= 0 ? summerDays + " days" : "passed"}</div>
        <div class="stat-note">${esc(summerDays >= 0 ? DATA.summer.countdownNote : DATA.summer.countdownPassedNote)}</div>
      </div>` : "";

    const upcoming = DATA.programs
      .filter(p => p.deadlineSort && daysUntil(p.deadlineSort) >= 0)
      .sort((a, b) => a.deadlineSort.localeCompare(b.deadlineSort))
      .slice(0, 4);

    const dueItems = [];
    DATA.checklist.forEach(ph => ph.items.forEach(it => {
      if (state.checks?.[it.id]) return;
      const d = daysUntil(it.due);
      if (d <= 7) dueItems.push({ ...it, d });
    }));
    dueItems.sort((a, b) => a.d - b.d);

    return `
      <h2 class="section">Overview</h2>
      <p class="section-sub">Where you stand on ${fmtToday()}.</p>

      <div class="grid cols-4">
        <div class="card stat">
          <div class="stat-label">Cumulative GPA</div>
          <div class="stat-value">${g.cumulative}</div>
          <div class="stat-note">${esc(g.framing)}</div>
          ${sparkline(g.semesters)}
        </div>
        ${summerCard}
        <div class="card stat">
          <div class="stat-label">Shortlist</div>
          <div class="stat-value">15 + 1</div>
          <div class="stat-note">${tierBadges}</div>
          <div class="stat-note">${starred ? starred + " starred for your apply list" : "Star programmes to build your ~8 apply list"} · ${DATA.reserves.length} reserves + ${DATA.cuts.length} cuts in the Reserves tab</div>
        </div>
        <div class="card stat">
          <div class="stat-label">EU watch</div>
          <div class="stat-value" style="font-size:18px; line-height:1.3; margin-top:6px;">${esc(DATA.strategy.euWatch.teaserTitle)}</div>
          <div class="stat-note">${esc(DATA.strategy.euWatch.teaser)}</div>
        </div>
      </div>

      <h3 class="sub">Next application deadlines</h3>
      <div class="grid cols-2">
        ${upcoming.map(p => `
          <div class="card prog-card ${tierClass(p.tier)}">
            <div class="prog-head"><h4>${esc(p.university)} <span class="country">${esc(p.country)}</span></h4>
            <span class="badge ${tierClass(p.tier)}">${tierLabel(p.tier)}</span></div>
            <div class="prog-programmes">${esc(p.programmes)}</div>
            ${deadlineChip(p)}
          </div>`).join("")}
      </div>

      <h3 class="sub">Needs your attention ${dueItems.length ? `(${dueItems.length})` : ""}</h3>
      ${dueItems.length ? dueItems.slice(0, 8).map(it => checkItemHTML(it, findPhase(it.id))).join("")
        : `<div class="card muted">Nothing overdue or due this week. The full plan lives in the Checklist tab.</div>`}
    `;
  }

  function findPhase(itemId) {
    return DATA.checklist.find(ph => ph.items.some(i => i.id === itemId));
  }

  function sparkline(semesters) {
    const pts = semesters.filter(s => s.value != null);
    if (!pts.length) return "";
    const min = 3.0, max = 3.8, W = 150, H = 36;
    const x = i => 8 + i * ((W - 16) / Math.max(1, semesters.length - 1));
    const y = v => H - 4 - ((v - min) / (max - min)) * (H - 8);
    const line = pts.map((s, i) => `${x(i)},${y(s.value)}`).join(" ");
    const dots = pts.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.value)}" r="2.5" fill="var(--accent)"/>`).join("");
    const expected = semesters.find(s => s.value == null && s.expected);
    const expDot = expected
      ? `<circle cx="${x(semesters.indexOf(expected))}" cy="${y(3.3)}" r="2.5" fill="none" stroke="var(--match)" stroke-dasharray="2 1.5"/>`
      : "";
    const labels = semesters.map((s, i) =>
      `<text x="${x(i)}" y="${H + 9}" font-size="7.5" fill="var(--text-3)" text-anchor="middle">${s.label}</text>`).join("");
    return `<svg class="sparkline" width="${W}" height="${H + 12}" viewBox="0 0 ${W} ${H + 12}">
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      ${dots}${expDot}${labels}</svg>`;
  }

  // ------------------------------------------------------------ PROGRAMMES
  function renderPrograms() {
    const f = state.filters || {};
    const countries = [...new Set(DATA.programs.map(p => p.country))].sort();

    let list = DATA.programs.slice();
    if (f.tier) list = list.filter(p => p.tier === f.tier);
    if (f.country) list = list.filter(p => p.country === f.country);
    if (f.mine) list = list.filter(p => progState(p.id).star);
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter(p => (p.university + p.programmes + p.country + p.whyKeep).toLowerCase().includes(q));
    }
    const sort = f.sort || "rank";
    if (sort === "rank") list.sort((a, b) => a.rank - b.rank);
    if (sort === "deadline") list.sort((a, b) => (a.deadlineSort || "9999").localeCompare(b.deadlineSort || "9999"));
    if (sort === "tier") { const o = { "DUAL": 0, "REACH": 1, "OPTIMISTIC MATCH": 2, "REALISTIC MATCH": 3, "LIKELY": 4 }; list.sort((a, b) => o[a.tier] - o[b.tier]); }
    if (sort === "name") list.sort((a, b) => a.university.localeCompare(b.university));
    if (sort === "total") list.sort((a, b) => totalSortKey(a) - totalSortKey(b));
    if (sort === "odds") list.sort((a, b) => (isNum(admissionMid(b)) ? admissionMid(b) : -1) - (isNum(admissionMid(a)) ? admissionMid(a) : -1));

    return `
      <h2 class="section">Programmes — the ranked shortlist</h2>
      <p class="section-sub">${esc(DATA.oddsInfo.basis)} ${esc(DATA.oddsInfo.provenance)}</p>

      ${toggleBar()}
      <div class="prog-filters">
        <select data-filter="tier">
          <option value="">All tiers</option>
          ${TIERS.concat("DUAL").map(t => `<option value="${t}" ${f.tier === t ? "selected" : ""}>${tierLabel(t)}</option>`).join("")}
        </select>
        <select data-filter="country">
          <option value="">All countries</option>
          ${countries.map(c => `<option ${f.country === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <select data-filter="sort">
          <option value="rank" ${sort === "rank" ? "selected" : ""}>By rank</option>
          <option value="total" ${sort === "total" ? "selected" : ""}>By yearly total</option>
          <option value="odds" ${sort === "odds" ? "selected" : ""}>By admission chance</option>
          <option value="deadline" ${sort === "deadline" ? "selected" : ""}>Nearest deadline first</option>
          <option value="tier" ${sort === "tier" ? "selected" : ""}>By tier</option>
          <option value="name" ${sort === "name" ? "selected" : ""}>By name</option>
        </select>
        <input type="search" placeholder="Search…" data-filter="q" value="${esc(f.q || "")}">
        <button class="toggle-btn ${f.mine ? "on" : ""}" data-filter-toggle="mine">★ My list</button>
      </div>

      <p class="tiny" style="margin:-6px 0 12px;">Tap a row to expand full costs, scholarships, housing and scores. Costs follow the EU/non-EU toggle; chances follow PRL.</p>
      <div class="uni-list">
        ${list.map(progCard).join("") || '<div class="card muted">No programmes match these filters.</div>'}
      </div>
    `;
  }

  function progCard(p) {
    const ps = progState(p.id);
    const status = ps.status || "Not started";
    const statusCls = status === "Submitted" || status === "Interview" ? "status-submitted"
      : status === "Offer" ? "status-offer"
      : status === "Rejected" || status === "Declined" ? "status-reject" : "";
    const city = DATA.cities.find(c => c.id === p.cityId);
    const prl = prlOn();
    const range = prl ? p.odds.withPRL : p.odds.noPRL;
    const mid = admissionMid(p);
    const open = !!(state.expanded && state.expanded[p.id]);
    return `
      <details class="uni prog-card ${tierClass(p.tier)}" id="prog-${p.id}" data-uni="${p.id}"${open ? " open" : ""}>
        <summary class="uni-banner">
          <span class="ub-rank">${p.dualDegree ? '<span class="badge dual">DUAL</span>' : "#" + p.rank}</span>
          <span class="ub-name">${esc(p.university)} <span class="country">${esc(p.country)}</span>
            <span class="ub-prog">${esc(p.programmes)}</span></span>
          <span class="ub-tags">
            <span class="badge ${tierClass(p.tier)}">${tierLabel(p.tier)}</span>
            ${isNum(mid) ? `<span class="ub-metric chance"><span class="metric-num" data-countup="${mid}">0</span><span class="mu">%</span><span class="ml">chance</span></span>` : ""}
            <span class="ub-metric"><span class="metric-num">${eur(activeTotal(p))}</span><span class="ml">/yr ${euMode() === "eu" ? "EU" : "non-EU"}</span></span>
            ${deadlineMini(p)}
          </span>
          <span class="ub-chev" aria-hidden="true">▸</span>
        </summary>
        <div class="uni-detail">
          <button class="star-btn ${ps.star ? "on" : ""}" data-star="${p.id}" title="Star for your apply list">${ps.star ? "★" : "☆"}</button>
          <div class="prog-meta">
            <span class="badge neutral">QS ${esc(p.qsRank)}</span>
            ${p.score ? `<span class="badge neutral">fit ${p.score}/100</span>` : ""}
            <span class="badge neutral">${esc(p.riskRole)}</span>
          </div>
          <div class="prog-fit">${esc(p.summaryText || p.whyKeep)}</div>
          ${p.tradeoffs ? `<div class="tiny" style="margin-bottom:6px;">Trade-offs: ${esc(p.tradeoffs)}</div>` : ""}

          <div class="prog-block odds-block">
            <span class="blk-label">Admission odds ${prl ? "(with PRL)" : "(without PRL)"} · confidence: ${esc(p.odds.confidence)}${p.odds.adjusted ? ' · <span class="badge eu">adjusted ↑</span>' : ""}</span>
            <span class="odds-range">${esc(range)}</span>
            <span class="odds-delta">PRL impact: ${esc(p.odds.prlImpact)}</span>
            <div style="margin-top:5px;">${esc(p.odds.verdict)}</div>
            ${p.odds.scrutinyNote ? `<div class="tiny" style="margin-top:4px;">${esc(p.odds.scrutinyNote)}</div>` : ""}
          </div>

          ${deadlineBlock(p)}
          ${scoresChart(p)}
          ${costDetail(p)}
          ${scholarshipDetail(p)}
          ${housingDetail(p)}

          <div class="prog-block">
            <span class="blk-label">Hard requirements ${verdictBadge(p.hardReq.verdict)}</span>
            ${esc(p.hardReq.text)}
            <div class="tiny" style="margin-top:4px;">${esc(p.hardReq.verified)}</div>
          </div>
          <div class="prog-block">
            <span class="blk-label">Getting home</span>
            <b>${esc(p.connectivity.rating)}</b> · ${esc(p.connectivity.doorToDoor)} · campus: ${esc(p.connectivity.campusAccess)}
            <div class="tiny" style="margin-top:4px;">${esc(p.connectivity.note)}</div>
          </div>
          <div class="prog-block">
            <span class="blk-label"><span class="badge eu">${esc(DATA.strategy.euWatch.badgeLabel)}</span></span>
            ${esc(p.euImpact.text)}
          </div>
          <div class="prog-block">
            <span class="blk-label">Strategy & next action</span>
            ${esc(p.appStrategy)}
            <div class="tiny" style="margin-top:4px;">Next: ${esc(p.nextAction)}</div>
          </div>

          <div class="prog-controls">
            <select data-status="${p.id}" class="${statusCls}">
              ${STATUSES.map(s => `<option ${s === status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <textarea class="prog-notes" data-notes="${p.id}" placeholder="Your notes…">${esc(ps.notes || "")}</textarea>
          <div class="prog-links">
            ${p.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}
            ${city ? `<a href="#" data-goto-city="${city.id}">City: ${esc(city.name)}</a>` : ""}
          </div>
        </div>
      </details>`;
  }

  // ------------------------------------------------------------ RESERVES
  function reserveId(r) {
    return "rsv-" + (r.university + "-" + (r.programme || "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function reserveCard(r) {
    const city = DATA.cities.find(c => c.id === r.cityId);
    const rid = reserveId(r);
    const open = !!(state.expanded && state.expanded[rid]);
    return `
      <details class="uni prog-card ${tierClass(r.tier)}" id="${rid}" data-uni="${rid}"${open ? " open" : ""}>
        <summary class="uni-banner">
          <span class="ub-rank"><span class="badge neutral">RES</span></span>
          <span class="ub-name">${esc(r.university)} <span class="country">${esc(r.country)}</span>
            <span class="ub-prog">${esc(r.programme)}</span></span>
          <span class="ub-tags">
            <span class="badge ${tierClass(r.tier)}">${tierLabel(r.tier)}</span>
            ${/pending|likely supplementary/i.test(r.suppRisk || "") ? `<span class="badge warn">${esc(r.suppRisk)}</span>` : ""}
            <span class="ub-metric"><span class="metric-num">${eur(activeTotal(r))}</span><span class="ml">/yr ${euMode() === "eu" ? "EU" : "non-EU"}</span></span>
            ${deadlineMini(r)}
          </span>
          <span class="ub-chev" aria-hidden="true">▸</span>
        </summary>
        <div class="uni-detail">
          <div class="prog-meta">
            <span class="badge neutral">QS ${esc(r.qsRank)}</span>
            <span class="badge neutral">${esc(r.suppRisk)}</span>
          </div>
          <div class="prog-fit">${esc(r.summaryText || r.reason)}</div>
          ${r.tradeoffs ? `<div class="tiny" style="margin-bottom:6px;">Trade-offs: ${esc(r.tradeoffs)}</div>` : ""}
          ${deadlineBlock(r)}
          ${scoresChart(r)}
          ${costDetail(r)}
          ${scholarshipDetail(r)}
          ${housingDetail(r)}
          <div class="prog-block">
            <span class="blk-label">If reconsidered</span>
            ${esc(r.ifReconsidered)}
          </div>
          <div class="prog-block">
            <span class="blk-label">Prerequisites</span>
            ${esc(r.prereqStatus)}
          </div>
          <div class="tiny" style="margin:8px 0 0;">Home trip: ${esc(r.connectivity)}</div>
          <div class="prog-links">
            <a href="${esc(r.source)}" target="_blank" rel="noopener">Official ↗</a>
            ${city ? `<a href="#" data-goto-city="${city.id}">City: ${esc(city.name)}</a>` : ""}
          </div>
        </div>
      </details>`;
  }
  function renderReserves() {
    return `
      <h2 class="section">Reserves & cuts</h2>
      <p class="section-sub">${DATA.reserves.length} reserves stay warm in case a main-list programme falls after requirement or deadline checks. The ${DATA.cuts.length} cuts below are kept for the record, with the reason each was removed.</p>

      ${toggleBar()}
      <div class="uni-list">
        ${DATA.reserves.map(reserveCard).join("")}
      </div>

      <h3 class="sub">Cuts — removed, with reasons</h3>
      <div class="grid cols-2">
        ${DATA.cuts.map(c => `
          <div class="card cut-card">
            <h4>${esc(c.university)} <span class="country">${esc(c.country)}</span></h4>
            <div class="prog-programmes">${esc(c.programme)} · QS ${esc(c.qsRank)}</div>
            <div class="prog-fit">${esc(c.reason)}</div>
            <div class="tiny">Reconsider: ${esc(c.ifReconsidered)} · <a href="${esc(c.source)}" target="_blank" rel="noopener">source ↗</a></div>
          </div>`).join("")}
      </div>`;
  }

  // ------------------------------------------------------------ CITIES
  function cityCard(c) {
    const progs = DATA.programs.filter(p => p.cityId === c.id)
      .concat(DATA.reserves.filter(r => r.cityId === c.id).map(r => ({ university: r.university + " (reserve)" })));
    const cid = "city-" + c.id;
    const open = !!(state.expanded && state.expanded[cid]);
    return `
      <details class="uni city-uni" id="${cid}" data-uni="${cid}"${open ? " open" : ""}>
        <summary class="uni-banner">
          <span class="ub-name">${esc(c.name)} <span class="country">${esc(c.country)}</span>
            <span class="ub-prog">${progs.length ? progs.map(p => esc(p.university)).join(" · ") : "No programmes here"}</span></span>
          <span class="ub-tags"><span class="city-budget">${esc(c.budget)}</span></span>
          <span class="ub-chev" aria-hidden="true">▸</span>
        </summary>
        <div class="uni-detail">
          <div class="city-row"><b>Rent:</b> ${esc(c.rent)}</div>
          <div class="city-row"><b>Vibe:</b> ${esc(c.vibe)}</div>
          <div class="city-row"><b>Language:</b> ${esc(c.language)}</div>
          <div class="city-row"><b>Weather:</b> ${esc(c.weather)}</div>
          <div class="city-row"><b>Student life:</b> ${esc(c.studentLife)}</div>
          <div class="city-verdict">${esc(c.verdict)}</div>
          ${c.housing && c.housing.length ? `<div class="city-housing"><span class="blk-label">Housing risk</span>${c.housing.map(h => `<div class="city-row"><b>${esc(h.university)}:</b> ${esc(h.label)} (${esc(String(h.score1to5))}/5) · start ${esc(h.leadTime || "—")}${h.isolation ? " · " + esc(h.isolation) : ""}</div>`).join("")}</div>` : ""}
          <div class="city-progs">Programmes here: ${progs.map(p => esc(p.university)).join(" · ") || "—"}</div>
        </div>
      </details>`;
  }
  function renderCities() {
    return `
      <h2 class="section">Cities</h2>
      <p class="section-sub">Honest profiles. Budgets are approximate monthly all-in (rent + living) for a student — June-2026 estimates; sanity-check on Numbeo before deciding. Tap a city to expand.</p>
      <div class="uni-list">
        ${DATA.cities.map(cityCard).join("")}
      </div>`;
  }

  // ------------------------------------------------------------ TIMELINE
  function renderTimeline() {
    const items = DATA.programs
      .filter(p => p.deadlineSort)
      .map(p => ({ date: p.deadlineSort, est: p.deadlineEstimate, tier: p.tier, label: `${p.university} — ${p.deadline}` }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const t = today().toISOString().slice(0, 10);
    const months = {};
    let todayInserted = false;
    const monthKey = iso => iso.slice(0, 7);
    const monthLabel = iso => parseISO(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    let html = "";
    let currentMonth = "";
    const renderItem = it => `
      <div class="tl-item ${tierClass(it.tier)}">
        <span class="tl-date">${it.est ? "~" : ""}${fmtDate(it.date)}</span>
        ${esc(it.label)}
      </div>`;

    for (const it of items) {
      if (!todayInserted && it.date >= t) {
        html += `<div class="tl-today">◆ Today — ${fmtToday()}</div>`;
        todayInserted = true;
      }
      const mk = monthKey(it.date);
      if (mk !== currentMonth) {
        currentMonth = mk;
        html += `<div class="tl-month"><h4>${monthLabel(it.date)}</h4></div>`;
      }
      html += renderItem(it);
    }
    if (!todayInserted) html += `<div class="tl-today">◆ Today — ${fmtToday()}</div>`;

    return `
      <h2 class="section">Deadline timeline</h2>
      <p class="section-sub">Application season runs Nov 2026 → Jun 2027. Dates marked ~ are estimated from last year's cycle — re-verify each official page. The late-deadline group (TUM, TU/e, Twente, KIT, UPC, Polimi rounds, Jena) is your strategic friend: S5 grades and a thesis-in-progress will be visible.</p>
      <div class="tl">${html}</div>`;
  }

  // ------------------------------------------------------------ CHECKLIST
  function checkItemHTML(it, phase) {
    const done = !!state.checks?.[it.id];
    const d = daysUntil(it.due);
    let dueCls = "due-later", dueTxt = fmtDate(it.due);
    if (done) { dueCls = "due-done"; dueTxt = "done"; }
    else if (d < 0) { dueCls = "due-overdue"; dueTxt = `overdue · ${fmtDate(it.due)}`; }
    else if (d <= 7) { dueCls = "due-week"; dueTxt = d === 0 ? "today" : `in ${d}d`; }
    return `
      <div class="check-item ${done ? "done" : ""}">
        <input type="checkbox" data-check="${it.id}" ${done ? "checked" : ""}>
        <div class="check-text">${esc(it.text)}${phase ? ` <span class="tiny">· ${esc(phase.phase)}</span>` : ""}</div>
        <span class="check-due ${dueCls}">${dueTxt}</span>
      </div>`;
  }

  function renderChecklist() {
    return `
      <h2 class="section">Checklist</h2>
      <p class="section-sub">The full plan from today to decision day, grouped by phase. The dashboard reads today's date — overdue items turn red, this week's turn amber.</p>
      ${DATA.checklist.map(ph => {
        const done = ph.items.filter(i => state.checks?.[i.id]).length;
        const pct = Math.round(100 * done / ph.items.length);
        return `
        <div class="phase">
          <div class="phase-head">
            <h3>${esc(ph.phase)}</h3>
            <span class="tiny">${done}/${ph.items.length}</span>
          </div>
          <div class="progress"><div style="width:${pct}%"></div></div>
          ${ph.items.map(it => checkItemHTML(it, null)).join("")}
        </div>`;
      }).join("")}`;
  }

  // ------------------------------------------------------------ SUMMER
  function renderSummer() {
    const s = DATA.summer;
    const d = daysUntil(s.decisionDate);
    state.summer = state.summer || {};
    return `
      <h2 class="section">Summer 2026</h2>
      <p class="section-sub">${esc(s.headline)}</p>

      <div class="grid cols-2">
        <div class="card stat ${d <= 10 ? "urgent" : ""}">
          <div class="stat-label">Decision deadline — ${fmtDate(s.decisionDate)}</div>
          <div class="countdown">${d >= 0 ? d + " days left" : "passed " + Math.abs(d) + "d ago"}</div>
          <div class="stat-note">${esc(d >= 0 ? "Collect the yes/nos, apply the rule, commit to one — then stop." : DATA.summer.passedNote)}</div>
        </div>
        <div class="card">
          <h4>The decision rule</h4>
          <div class="summer-rule">${esc(s.rule)}</div>
        </div>
      </div>

      <h3 class="sub">Options <span class="tiny">— set a status for each</span></h3>
      <div class="grid cols-2">
        ${s.options.map(o => {
          const cur = state.summer[o.id] || o.defaultStatus;
          return `
          <div class="card summer-opt">
            <div class="summer-opt-head">
              <h4>${esc(o.name)}</h4>
              <span class="badge ${summerStatusClass(cur)}">${esc(cur)}</span>
            </div>
            <div class="muted summer-opt-role">${esc(o.role)}</div>
            <div class="prog-block">${esc(o.note)}</div>
            <div class="seg-group" role="group" aria-label="Set status">
              ${SUMMER_STATUSES.map(st => `<button class="seg-btn ${summerStatusClass(st)}${st === cur ? " on" : ""}" data-summer-set="${o.id}" data-summer-status="${esc(st)}">${esc(st)}</button>`).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>`;
  }
  function summerStatusClass(st) {
    return { "Probing": "warn", "Confirmed": "ok", "Chosen ✓": "ok", "Declined": "bad", "Optional": "neutral" }[st] || "neutral";
  }

  // ------------------------------------------------------------ PROFILE
  function renderProfile() {
    const pr = DATA.profile;
    return `
      <h2 class="section">Profile</h2>
      <p class="section-sub">The facts admissions committees will see — doubles as your CV reference.</p>

      <div class="grid cols-2">
        <div class="card">
          <h4>Who</h4>
          <dl class="kv">
            <dt>Name</dt><dd>${esc(pr.name)}</dd>
            <dt>Nationality</dt><dd>${esc(pr.nationality)}</dd>
            <dt>Home / base</dt><dd>${esc(pr.hometown)} · ${esc(pr.base)}</dd>
            <dt>Languages</dt><dd>${esc(pr.languages)}</dd>
            <dt>IELTS</dt><dd>${esc(pr.tests.ielts)}</dd>
            <dt>SAT</dt><dd>${esc(pr.tests.sat)}</dd>
            <dt>GRE</dt><dd>${esc(pr.tests.gre)}</dd>
          </dl>
        </div>
        <div class="card">
          <h4>GPA</h4>
          <dl class="kv">
            <dt>Cumulative</dt><dd>${DATA.gpa.cumulative} / 4.3</dd>
            <dt>Scale</dt><dd>${esc(DATA.gpa.scale)}</dd>
            <dt>Trend</dt><dd>${DATA.gpa.semesters.map(s => s.value ?? s.expected).join(" → ")}</dd>
            ${(DATA.gpa.conversions || []).map(c => `<dt>${esc(c.system)}</dt><dd>${esc(c.value)}</dd>`).join("")}
          </dl>
          <div class="prog-block" style="margin-top:10px;">${esc(DATA.gpa.framing)}</div>
          <div class="muted" style="margin-top:8px;">${DATA.gpa.weaknesses.map(esc).join("<br>")}</div>
        </div>
      </div>

      <h3 class="sub">Education</h3>
      <div class="grid cols-2">
        ${pr.education.map(e => `<div class="card"><h4>${esc(e.title)}</h4><div class="muted">${esc(e.detail)}</div></div>`).join("")}
      </div>

      <h3 class="sub">Project, internships & planned research</h3>
      <div class="grid cols-2">
        <div class="card">
          <h4>${esc(pr.project.title)}</h4>
          <div class="muted">${esc(pr.project.detail)}</div>
          <div class="prog-block" style="margin-top:10px;"><span class="badge warn">honesty rule</span> ${esc(pr.project.warning)}</div>
        </div>
        <div class="card">
          <h4>Internships</h4>
          ${pr.internships.map(i => `<div style="margin-bottom:10px;"><b style="font-size:13.5px;">${esc(i.title)}</b><div class="muted">${esc(i.detail)}</div></div>`).join("")}
        </div>
        ${pr.plannedResearch.map(r => `<div class="card"><h4>${esc(r.title)}</h4><div class="muted">${esc(r.detail)}</div></div>`).join("")}
      </div>

      <h3 class="sub">Course map S1–S6</h3>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Sem</th><th>Course</th><th>Grade</th><th>Status at application</th><th>Why it matters</th></tr></thead>
          <tbody>
            ${DATA.courses.map(c => `
              <tr>
                <td style="white-space:nowrap;">${esc(c.sem)}</td>
                <td>${esc(c.name)}</td>
                <td class="${c.weak ? "grade-weak" : c.pending ? "grade-pending" : ""}" style="white-space:nowrap;">${esc(c.grade)}</td>
                <td style="white-space:nowrap;">${esc(c.status)}</td>
                <td>${esc(c.relevance)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  // ------------------------------------------------------------ STRATEGY
  function renderStrategy() {
    const st = DATA.strategy;
    const eu = st.euWatch;
    return `
      <h2 class="section">Strategy</h2>
      <p class="section-sub">The candid read and the rules you agreed with yourself. Private.</p>

      <div class="card"><h4>Bottom line</h4><div class="muted">${esc(st.bottomLine)}</div>
        <div class="prog-block" style="margin-top:10px;">${esc(st.tierLogic)}</div>
      </div>

      <h3 class="sub">Standing reminders</h3>
      <div class="card"><ul class="clean">${st.reminders.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>

      <h3 class="sub">Open decisions</h3>
      <div class="card"><ul class="clean">${st.openDecisions.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>

      <h3 class="sub">EU accession watch <span class="badge eu">${esc(eu.stamp)}</span></h3>
      <div class="grid cols-2">
        <div class="card"><h4>Where it stands</h4><div class="muted">${esc(eu.status)}</div></div>
        <div class="card"><h4>What it means for your timing</h4><div class="muted">${esc(eu.timing)}</div></div>
      </div>
      <div class="table-wrap" style="margin-top:14px;">
        <table class="data">
          <thead><tr><th>Country</th><th>${esc(eu.tableHeader)}</th></tr></thead>
          <tbody>${eu.perCountry.map(c => `<tr><td style="white-space:nowrap;"><b>${esc(c.country)}</b></td><td>${esc(c.text)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="card" style="margin-top:14px;"><h4>Beyond fees</h4><div class="muted">${esc(eu.otherBenefits)}</div></div>

      ${DATA.transition && DATA.transition.length ? `
      <h3 class="sub">Worker-transition — by round</h3>
      <p class="tiny" style="margin:-4px 0 10px;">Croatia is the benchmark; the final treaty formula isn't public, so this uses Round 1 / 2 / 3, not fixed years. Tuition status is separate from worker-market access.</p>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Country</th><th>Risk</th><th>Round 1 / 2 / 3</th><th>Fee-status implication</th></tr></thead>
          <tbody>${DATA.transition.map(t => `<tr>
            <td style="white-space:nowrap;"><b>${esc(t.country)}</b><div class="tiny">${esc(t.status)}</div></td>
            <td>${esc(t.risk)}</td>
            <td>${esc(t.round1)}<br>${esc(t.round2)}<br>${esc(t.round3)}</td>
            <td>${esc(t.feeImplication)}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>` : ""}

      ${DATA.feeStatus && DATA.feeStatus.length ? `
      <h3 class="sub">Fee-status questions</h3>
      <div class="grid cols-2">
        ${DATA.feeStatus.map(q => `<div class="card"><h4>${esc(q.question)}</h4><div class="muted">${esc(q.answer)}</div>
          <div class="prog-block" style="margin-top:8px;">${esc(q.meaning)}</div>
          <div class="tiny" style="margin-top:6px;">Confidence: ${esc(q.confidence)}</div></div>`).join("")}
      </div>` : ""}

      <h3 class="sub">Caveats</h3>
      <div class="card"><ul class="clean">${st.caveats.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
  }

  // ------------------------------------------------------------ COMPARE
  function renderCompare() {
    const sort = (state.filters && state.filters.cmpSort) || "total";
    let list = DATA.programs.slice();
    if (sort === "total") list.sort((a, b) => totalSortKey(a) - totalSortKey(b));
    else if (sort === "admission") list.sort((a, b) => (isNum(admissionMid(b)) ? admissionMid(b) : -1) - (isNum(admissionMid(a)) ? admissionMid(a) : -1));
    else if (sort === "fit") list.sort((a, b) => ((b.scores && b.scores.fit) || 0) - ((a.scores && a.scores.fit) || 0));
    else list.sort((a, b) => a.rank - b.rank);
    const eu = euMode() === "eu";
    return `
      <h2 class="section">Compare</h2>
      <p class="section-sub">All ranked programmes side by side. Costs follow the EU/non-EU toggle; chances follow PRL. “Verify”/“N/A” totals sort last and are never guessed. Tap a row to open its full card.</p>
      ${toggleBar()}
      <div class="prog-filters">
        <select data-filter="cmpSort">
          <option value="total" ${sort === "total" ? "selected" : ""}>Sort: yearly total</option>
          <option value="admission" ${sort === "admission" ? "selected" : ""}>Sort: admission chance</option>
          <option value="fit" ${sort === "fit" ? "selected" : ""}>Sort: fit score</option>
          <option value="rank" ${sort === "rank" ? "selected" : ""}>Sort: rank</option>
        </select>
      </div>
      <div class="table-wrap">
        <table class="data compare">
          <thead><tr><th>#</th><th>University</th><th>Tier</th><th>Chance</th><th>€/yr ${eu ? "EU" : "non-EU"}</th><th>Fit</th></tr></thead>
          <tbody>${list.map(p => {
            const mid = admissionMid(p);
            return `<tr data-goto-prog="${p.id}">
              <td>${p.dualDegree ? "·" : p.rank}</td>
              <td><b>${esc(p.university)}</b><span class="country"> ${esc(p.country)}</span></td>
              <td><span class="badge ${tierClass(p.tier)}">${tierLabel(p.tier)}</span></td>
              <td class="num">${isNum(mid) ? `<span class="metric-num" data-countup="${mid}">0</span>%` : "—"}</td>
              <td class="num">${eur(activeTotal(p))}</td>
              <td class="num">${p.scores ? p.scores.fit : "—"}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>`;
  }

  // ------------------------------------------------------------ event wiring
  function bindMain() {
    const main = $("#main");

    main.addEventListener("change", e => {
      const t = e.target;
      if (t.dataset.status) { progState(t.dataset.status).status = t.value; saveState(); switchTab("programs"); }
      if (t.dataset.summer) { state.summer = state.summer || {}; state.summer[t.dataset.summer] = t.value; saveState(); }
      if (t.dataset.check !== undefined && t.type === "checkbox") {
        state.checks = state.checks || {};
        if (t.checked) state.checks[t.dataset.check] = true; else delete state.checks[t.dataset.check];
        saveState(); switchTab(state.tab);
      }
      if (t.dataset.filter) {
        state.filters = state.filters || {};
        state.filters[t.dataset.filter] = t.value;
        saveState(); switchTab(state.tab);
      }
    });

    main.addEventListener("input", e => {
      const t = e.target;
      if (t.dataset.notes) { progState(t.dataset.notes).notes = t.value; saveState(); }
      if (t.dataset.filter === "q") {
        state.filters = state.filters || {};
        state.filters.q = t.value; saveState();
        clearTimeout(window.__qDeb);
        window.__qDeb = setTimeout(() => {
          switchTab("programs");
          const q = $('input[data-filter="q"]');
          if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        }, 350);
      }
    });

    main.addEventListener("click", e => {
      const star = e.target.closest("[data-star]");
      if (star) {
        const ps = progState(star.dataset.star);
        ps.star = !ps.star; saveState(); switchTab(state.tab);
      }
      const toggle = e.target.closest("[data-filter-toggle]");
      if (toggle) {
        state.filters = state.filters || {};
        const k = toggle.dataset.filterToggle;
        if (k === "prlflip") state.filters.prl = !prlOn(); // explicit flip — PRL defaults to ON when unset
        else if (k === "euStatus") state.filters.euStatus = euMode() === "eu" ? "nonEu" : "eu";
        else state.filters[k] = !state.filters[k];
        saveState(); switchTab(state.tab);
      }
      const goCity = e.target.closest("[data-goto-city]");
      if (goCity) {
        e.preventDefault();
        state.expanded = state.expanded || {};
        state.expanded["city-" + goCity.dataset.gotoCity] = true; // open the target city
        saveState();
        switchTab("cities");
        const el = $("#city-" + goCity.dataset.gotoCity);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const goProg = e.target.closest("[data-goto-prog]");
      if (goProg) {
        state.expanded = state.expanded || {};
        state.expanded[goProg.dataset.gotoProg] = true;
        saveState(); switchTab("programs");
        const el = $("#prog-" + goProg.dataset.gotoProg);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const segBtn = e.target.closest("[data-summer-set]");
      if (segBtn) {
        state.summer = state.summer || {};
        state.summer[segBtn.dataset.summerSet] = segBtn.dataset.summerStatus;
        saveState(); switchTab("summer");
      }
    });
  }

  // ------------------------------------------------------------ boot
  (async () => {
    if (!LOCK_ENABLED) {
      // Lock disabled: open the dashboard directly, no password prompt.
      $("#lock").hidden = true;
      try {
        const { data } = await DashCrypto.decryptJson(ENCRYPTED_DATA, AUTO_PASSWORD);
        DATA = data;
        showApp();
      } catch (err) {
        // Auto-open shouldn't fail, but if it ever does, fall back to the lock
        // screen so the dashboard is still reachable rather than blank.
        console.error("Auto-open failed, showing lock screen:", err);
        $("#lock").hidden = false;
        $("#lock-error").textContent = "Auto-open failed: " + (err && err.message ? err.message : err);
        $("#lock-error").hidden = false;
      }
      return;
    }
    // Lock enabled: silent unlock if a key was remembered, else reveal the prompt.
    if (await tryRememberedKey()) showApp();
    else $("#lock").hidden = false;
  })();
})();
