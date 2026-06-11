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

  function tierClass(t) { return t.toLowerCase(); }

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
      overview: renderOverview, programs: renderPrograms, cities: renderCities,
      timeline: renderTimeline, checklist: renderChecklist, summer: renderSummer,
      profile: renderProfile, strategy: renderStrategy
    }[tab] || renderOverview;
    $("#main").innerHTML = render();
    window.scrollTo(0, sameTab ? keepY : 0);
  }

  // ------------------------------------------------------------ OVERVIEW
  function renderOverview() {
    const g = DATA.gpa;
    const tiers = { REACH: 0, MATCH: 0, LIKELY: 0 };
    DATA.programs.forEach(p => tiers[p.tier]++);
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
          <div class="stat-label">Programmes</div>
          <div class="stat-value">${DATA.programs.length}</div>
          <div class="stat-note">
            <span class="badge reach">${tiers.REACH} reach</span>
            <span class="badge match">${tiers.MATCH} match</span>
            <span class="badge likely">${tiers.LIKELY} likely</span>
          </div>
          <div class="stat-note">${starred ? starred + " starred for your apply list" : "Star programmes to build your ~8–10 apply list"}</div>
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
            <span class="badge ${tierClass(p.tier)}">${p.tier}</span></div>
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
    const directions = [...new Set(DATA.programs.flatMap(p => p.direction))].sort();

    let list = DATA.programs.slice();
    if (f.tier) list = list.filter(p => p.tier === f.tier);
    if (f.country) list = list.filter(p => p.country === f.country);
    if (f.direction) list = list.filter(p => p.direction.includes(f.direction));
    if (f.mine) list = list.filter(p => progState(p.id).star);
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter(p => (p.university + p.programmes + p.country + p.focus).toLowerCase().includes(q));
    }
    const sort = f.sort || "deadline";
    if (sort === "deadline") list.sort((a, b) => (a.deadlineSort || "9999").localeCompare(b.deadlineSort || "9999"));
    if (sort === "tier") { const o = { REACH: 0, MATCH: 1, LIKELY: 2 }; list.sort((a, b) => o[a.tier] - o[b.tier]); }
    if (sort === "name") list.sort((a, b) => a.university.localeCompare(b.university));

    return `
      <h2 class="section">Programmes</h2>
      <p class="section-sub">All ${DATA.programs.length} on the long list — the goal is to star your real ~8–10 by mid-October 2026. Statuses and notes save automatically on this device.</p>

      <div class="prog-filters">
        <select data-filter="tier">
          <option value="">All tiers</option>
          ${["REACH", "MATCH", "LIKELY"].map(t => `<option ${f.tier === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <select data-filter="direction">
          <option value="">All directions</option>
          ${directions.map(d => `<option ${f.direction === d ? "selected" : ""}>${esc(d)}</option>`).join("")}
        </select>
        <select data-filter="country">
          <option value="">All countries</option>
          ${countries.map(c => `<option ${f.country === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <select data-filter="sort">
          <option value="deadline" ${sort === "deadline" ? "selected" : ""}>By deadline</option>
          <option value="tier" ${sort === "tier" ? "selected" : ""}>By tier</option>
          <option value="name" ${sort === "name" ? "selected" : ""}>By name</option>
        </select>
        <input type="search" placeholder="Search…" data-filter="q" value="${esc(f.q || "")}">
        <button class="toggle-btn ${f.mine ? "on" : ""}" data-filter-toggle="mine">★ My list</button>
      </div>

      <div class="grid cols-2">
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
    return `
      <div class="card prog-card ${tierClass(p.tier)}" id="prog-${p.id}">
        <div class="prog-head">
          <h4>${esc(p.university)} <span class="country">${esc(p.country)}</span></h4>
          <button class="star-btn ${ps.star ? "on" : ""}" data-star="${p.id}" title="Star for your apply list">${ps.star ? "★" : "☆"}</button>
        </div>
        <div class="prog-meta">
          <span class="badge ${tierClass(p.tier)}">${p.tier}</span>
          ${p.direction.map(d => `<span class="badge neutral">${esc(d)}</span>`).join("")}
          ${p.onlyIfOptics ? '<span class="badge warn">only if optics appeals</span>' : ""}
        </div>
        <div class="prog-programmes">${esc(p.programmes)}</div>
        <div class="prog-fit">${esc(p.fit)}</div>

        <div class="prog-block">
          <span class="blk-label">Hard requirements ${verdictBadge(p.hardReq.verdict)}</span>
          ${esc(p.hardReq.text)}
          <div class="tiny" style="margin-top:4px;">${esc(p.hardReq.verified)}</div>
        </div>

        <div class="prog-block">
          <span class="blk-label">Cost (non-EU)</span>
          <b>${esc(p.feeNonEU)}</b>${p.feeNote ? ` — ${esc(p.feeNote)}` : ""}
        </div>

        <div class="prog-block">
          <span class="blk-label"><span class="badge eu">${esc(DATA.strategy.euWatch.badgeLabel)}</span></span>
          ${esc(p.euImpact.text)}
        </div>

        <div class="prog-controls">
          ${deadlineChip(p)}
          <select data-status="${p.id}" class="${statusCls}">
            ${STATUSES.map(s => `<option ${s === status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <textarea class="prog-notes" data-notes="${p.id}" placeholder="Your notes…">${esc(ps.notes || "")}</textarea>
        <div class="prog-links">
          ${p.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}
          ${city ? `<a href="#" data-goto-city="${city.id}">City: ${esc(city.name)}</a>` : ""}
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ CITIES
  function renderCities() {
    return `
      <h2 class="section">Cities</h2>
      <p class="section-sub">Honest profiles. Budgets are approximate monthly all-in (rent + living) for a student — June-2026 estimates; sanity-check on Numbeo before deciding.</p>
      <div class="grid cols-2">
        ${DATA.cities.map(c => {
          const progs = DATA.programs.filter(p => p.cityId === c.id);
          return `
          <div class="card city-card" id="city-${c.id}">
            <h4>${esc(c.name)} <span class="country">${esc(c.country)}</span></h4>
            <div class="city-budget">${esc(c.budget)}</div>
            <div class="city-row"><b>Rent:</b> ${esc(c.rent)}</div>
            <div class="city-row"><b>Vibe:</b> ${esc(c.vibe)}</div>
            <div class="city-row"><b>Language:</b> ${esc(c.language)}</div>
            <div class="city-row"><b>Weather:</b> ${esc(c.weather)}</div>
            <div class="city-row"><b>Student life:</b> ${esc(c.studentLife)}</div>
            <div class="city-verdict">${esc(c.verdict)}</div>
            <div class="city-progs">Programmes here: ${progs.map(p => esc(p.university)).join(" · ")}</div>
          </div>`;
        }).join("")}
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

      <h3 class="sub">Options</h3>
      <div class="grid cols-2">
        ${s.options.map(o => {
          const cur = state.summer[o.id] || o.defaultStatus;
          return `
          <div class="card">
            <div class="prog-head">
              <h4>${esc(o.name)}</h4>
              <select data-summer="${o.id}">
                ${SUMMER_STATUSES.map(st => `<option ${st === cur ? "selected" : ""}>${st}</option>`).join("")}
              </select>
            </div>
            <div class="muted" style="margin:6px 0;">${esc(o.role)}</div>
            <div class="prog-block">${esc(o.note)}</div>
          </div>`;
        }).join("")}
      </div>`;
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
            <dt>Cumulative</dt><dd>${DATA.gpa.cumulative} / 4.0</dd>
            <dt>Scale</dt><dd>${esc(DATA.gpa.scale)}</dd>
            <dt>Trend</dt><dd>${DATA.gpa.semesters.map(s => s.value ?? s.expected).join(" → ")}</dd>
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

      <h3 class="sub">Caveats</h3>
      <div class="card"><ul class="clean">${st.caveats.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
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
        saveState(); switchTab("programs");
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
        state.filters[toggle.dataset.filterToggle] = !state.filters[toggle.dataset.filterToggle];
        saveState(); switchTab("programs");
      }
      const goCity = e.target.closest("[data-goto-city]");
      if (goCity) {
        e.preventDefault();
        switchTab("cities");
        const el = $("#city-" + goCity.dataset.gotoCity);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
