/* ARCW Training – Web-App (Vanilla JS, keine Abhängigkeiten) */
(function () {
  'use strict';

  // ------------------------------------------------------------ Hilfsfunktionen
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('arcw_' + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('arcw_' + k, JSON.stringify(v)); } catch (e) { /* egal */ } },
    del(k) { try { localStorage.removeItem('arcw_' + k); } catch (e) { /* egal */ } }
  };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const todayISO = () => iso(new Date());
  const mondayOf = (s) => { const d = parseISO(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };
  const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const DOWL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const fmtShort = (s) => { const d = parseISO(s); return DOW[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; };
  const fmtLong = (s) => { const d = parseISO(s); return DOWL[d.getDay()] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); };
  const fmtNum = (n, digits) => n == null ? '–' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits == null ? 0 : digits });
  const fmtMin = (m) => { m = Math.round(m || 0); if (m < 60) return m + ' min'; return Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };
  const firstName = (n) => String(n).split(' ')[0];

  const ICON = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-8"/></svg>',
    hall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14c2.8 0 5 1.8 5 5"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
  };

  // ------------------------------------------------------------ Zustand
  const S = {
    auth: store.get('auth'),     // {name, pin}
    user: null,                  // {name, role, ...}
    data: null,                  // Sportler-Daten
    coach: null,                 // Trainer-Daten
    hall: null,
    view: 'today',
    date: todayISO(),
    planWeekStart: null,
    coachAthlete: null,          // Name des Sportlers in der Trainer-Detailansicht
    coachTab: 'stats',
    hallMode: 'total',
    expanded: {}
  };

  // ------------------------------------------------------------ API
  async function api(action, payload) {
    if (!window.CONFIG || !CONFIG.API_URL || /PLACEHOLDER/.test(CONFIG.API_URL)) throw new Error('API-URL fehlt in config.js');
    const body = Object.assign({ action }, S.auth || {}, payload || {});
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Server nicht erreichbar'); }
    if (!j.ok) throw new Error(j.error || 'Fehler');
    return j;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ------------------------------------------------------------ Kontext (Sportler-Sicht)
  function athleteCtx(name) {
    if (S.user && S.user.role === 'coach') {
      const C = S.coach;
      const a = C.athletes.find((x) => x.name === name);
      if (!a) return null;
      return {
        athlete: a,
        plan: C.plans[a.plan] || { units: [], weeks: [] },
        kraft: a.kraft ? C.kraft[a.kraft] : null,
        logs: C.logs.filter((l) => l.athlete === a.name),
        settings: C.settings,
        isCoach: true
      };
    }
    const D = S.data;
    return { athlete: D.athlete, plan: D.plan, kraft: D.kraft, logs: D.logs, settings: D.settings, isCoach: false };
  }

  function logsForUnit(ctx, unit) { return ctx.logs.filter((l) => l.unitKey === unit.key); }
  function logMinutes(l) { return l.minutes != null ? l.minutes : (l.planMinutes || 0); }

  // ------------------------------------------------------------ Laden
  async function loadAll(silent) {
    if (!silent) render('loading');
    const res = await api('login');
    S.user = res.user;
    if (S.user.role === 'coach') {
      S.coach = await api('coach');
      store.set('cache_coach', S.coach);
      if (!['ctoday', 'team', 'hall', 'athlete'].includes(S.view)) S.view = 'ctoday';
    } else {
      S.data = await api('athlete');
      store.set('cache_athlete', S.data);
      if (!['today', 'plan', 'stats', 'hall'].includes(S.view)) S.view = 'today';
    }
  }

  async function reloadData() {
    try {
      if (S.user.role === 'coach') S.coach = await api('coach');
      else S.data = await api('athlete');
      S.hall = null;
      render();
    } catch (e) { toast(e.message); }
  }

  // ------------------------------------------------------------ Login
  async function showLogin(errMsg) {
    $('#tabbar').hidden = true;
    $('#who').innerHTML = '';
    const app = $('#app');
    app.innerHTML = `
      <div class="login card">
        <h1>Willkommen</h1>
        <p class="muted">Melde dich mit deinem Namen und deiner PIN an.</p>
        <label class="f" for="ln">Name</label>
        <select class="in" id="ln"><option value="">Lädt …</option></select>
        <label class="f" for="lp">PIN</label>
        <input class="in pin" id="lp" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="••••">
        <button class="btn block mt" id="lb">Anmelden</button>
        <div class="err" id="le">${esc(errMsg || '')}</div>
        <p class="faint mt">PIN vergessen? Kurz beim Trainer melden.</p>
      </div>`;
    try {
      const r = await api('names');
      const sel = $('#ln');
      const athletes = r.names.filter((n) => n.role !== 'coach').sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const coaches = r.names.filter((n) => n.role === 'coach');
      sel.innerHTML = '<option value="">Name wählen …</option>' +
        athletes.map((n) => `<option>${esc(n.name)}</option>`).join('') +
        (coaches.length ? '<optgroup label="Trainer">' + coaches.map((n) => `<option>${esc(n.name)}</option>`).join('') + '</optgroup>' : '');
      const last = store.get('lastName');
      if (last) sel.value = last;
    } catch (e) { $('#le').textContent = e.message; }
    const go = async () => {
      const name = $('#ln').value, pin = $('#lp').value.trim();
      if (!name || !pin) { $('#le').textContent = 'Bitte Name und PIN eingeben'; return; }
      $('#lb').disabled = true; $('#le').textContent = '';
      S.auth = { name, pin };
      try {
        await loadAll(true);
        store.set('auth', S.auth);
        store.set('lastName', name);
        render();
      } catch (e) {
        S.auth = null;
        $('#le').textContent = e.message;
        $('#lb').disabled = false;
      }
    };
    $('#lb').onclick = go;
    $('#lp').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  function logout() {
    S.auth = null; S.user = null; S.data = null; S.coach = null; S.hall = null; S.view = null; S.date = todayISO(); S.planWeekStart = null;
    store.del('auth'); store.del('cache_athlete'); store.del('cache_coach');
    showLogin();
  }

  // ------------------------------------------------------------ Rahmen
  function renderChrome() {
    const u = S.user;
    $('#who').innerHTML = `<span>${esc(u.role === 'coach' ? 'Trainer' : firstName(u.name))}</span><button id="lo">Abmelden</button>`;
    $('#lo').onclick = logout;
    const tabs = u.role === 'coach'
      ? [['ctoday', 'Heute', ICON.today], ['team', 'Sportler', ICON.team], ['hall', 'Hall of Fame', ICON.hall]]
      : [['today', 'Heute', ICON.today], ['plan', 'Plan', ICON.plan], ['stats', 'Auswertung', ICON.stats], ['hall', 'Hall of Fame', ICON.hall]];
    const tb = $('#tabbar');
    tb.hidden = false;
    const activeView = S.view === 'athlete' ? 'team' : S.view;
    tb.innerHTML = tabs.map(([k, l, i]) => `<button data-v="${k}" class="${activeView === k ? 'active' : ''}">${i}<span>${l}</span></button>`).join('');
    $$('button', tb).forEach((b) => b.onclick = () => { S.view = b.dataset.v; if (S.view === 'today' || S.view === 'ctoday') S.date = todayISO(); render(); window.scrollTo(0, 0); });
  }

  function render(state) {
    const app = $('#app');
    if (state === 'loading') { app.innerHTML = '<div class="loading">Lädt …</div>'; return; }
    if (!S.user) return showLogin();
    renderChrome();
    switch (S.view) {
      case 'today': return renderToday(app, athleteCtx());
      case 'plan': return renderPlan(app, athleteCtx());
      case 'stats': return renderStats(app, athleteCtx());
      case 'hall': return renderHall(app);
      case 'ctoday': return renderCoachToday(app);
      case 'team': return renderTeam(app);
      case 'athlete': return renderCoachAthlete(app);
    }
  }

  // ------------------------------------------------------------ Einheiten-Karte
  function sectionsHTML(sec, fallback) {
    const parts = [['warmup', 'Warm-up'], ['main', 'Hauptteil'], ['cooldown', 'Cool-down'], ['other', '']];
    let html = '';
    parts.forEach(([k, l]) => {
      if (!sec || !sec[k]) return;
      const m = sec[k].match(/^(warm[\s-]?up|hauptteil|cool[\s-]?down)\s*(?:\(([^)]*)\))?\s*:?\s*/i);
      const dur = m && m[2] ? ' · ' + m[2] : '';
      const t = m ? sec[k].slice(m[0].length) : sec[k];
      html += `<div class="lbl">${esc((l || 'Info') + dur)}</div><div class="txt">${esc(t)}</div>`;
    });
    if (!html && fallback) html = `<div class="lbl">Info</div><div class="txt">${esc(fallback)}</div>`;
    return html ? `<div class="sec">${html}</div>` : '';
  }

  function kraftExercises(ctx, unit) {
    if (unit.type !== 'kraft') return { list: [], source: '' };
    const k = ctx.kraft;
    if (k && k.blocks && k.order && k.order.length) {
      const want = unit.kraftBlock;
      if (want && k.blocks[want]) return { list: k.blocks[want].exercises, source: 'sheet', block: want };
      if (want) return { list: [], source: '', missing: want };
      if (k.order.length === 1) return { list: k.blocks[k.order[0]].exercises, source: 'sheet', block: k.order[0] };
    }
    if (unit.exercises && unit.exercises.length) return { list: unit.exercises.map((e) => ({ name: e.name, reps: e.sets, weighted: true })), source: 'text' };
    return { list: [], source: '' };
  }

  function exerciseTable(ctx, unit) {
    const ex = kraftExercises(ctx, unit);
    if (ex.missing) return `<div class="note">Kraftplan „Plan ${esc(ex.missing)}“ ist im Kraft-Blatt noch nicht hinterlegt.</div>`;
    if (ex.source !== 'sheet' || !ex.list.length) return '';
    const rows = ex.list.map((e) => `<tr><td>${esc(e.nr)}</td><td><b>${esc(e.name)}</b>${e.material ? `<div class="faint">${esc(e.material)}</div>` : ''}${e.hint ? `<div class="faint">${esc(e.hint)}</div>` : ''}${e.video ? `<div><a href="${esc(e.video)}" target="_blank" rel="noopener">Video ansehen</a></div>` : ''}</td><td class="num">${esc(e.sets)}×${esc(e.reps)}</td><td class="num">${e.pause !== '' && e.pause != null ? esc(e.pause) + ' s' : ''}</td></tr>`).join('');
    return `<details class="ersatz" ${S.expanded['kx' + unit.key] ? 'open' : ''} data-x="kx${esc(unit.key)}"><summary>Kraftplan ${esc(ex.block)} anzeigen (${ex.list.length} Übungen)</summary>
      <div class="tablewrap exlist"><table><thead><tr><th>Nr.</th><th>Übung</th><th class="num">Sätze×Wdh.</th><th class="num">Pause</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }

  function logSummary(l) {
    const bits = [];
    bits.push(fmtMin(logMinutes(l)));
    if (l.km) bits.push(fmtNum(l.km, 1) + ' km');
    if (l.hr) bits.push('HF ' + l.hr);
    if (l.rpe) bits.push('RPE ' + l.rpe);
    if (l.hints && l.hints.length) bits.push('Vorgaben ' + l.hints.filter((h) => h.done).length + '/' + l.hints.length);
    return bits.join(' · ');
  }

  function unitCard(ctx, unit, opts) {
    opts = opts || {};
    if (unit.type === 'rest') {
      return `<div class="card rest"><div class="unit-head"><div><div class="unit-title">${esc(unit.title || 'Frei')}</div><div class="unit-meta">${esc(unit.text)}</div></div></div></div>`;
    }
    const logs = logsForUnit(ctx, unit);
    const zone = unit.zone ? `<span class="chip zone">${esc(unit.zone)}</span>` : '';
    const opt = unit.optional ? '<span class="chip opt">optional</span>' : '';
    const meta = [unit.time].filter(Boolean).join(' · ');
    let status;
    if (logs.length) {
      const l = logs[0];
      status = `<div class="status"><div class="row"><span class="chip good">✓ Protokolliert${l.date !== unit.date ? ' am ' + fmtShort(l.date) : ''}</span><span class="faint">${esc(logSummary(l))}</span>${l.screenshot ? '<span class="chip">Screenshot ✓</span>' : (unit.type === 'ausdauer' ? '<span class="chip warn">kein Screenshot</span>' : '')}</div>
        ${opts.noLog ? '' : `<button class="btn small secondary" data-log="${esc(unit.key)}" data-id="${esc(l.id)}">Bearbeiten</button>`}</div>`;
    } else {
      const past = unit.date <= dueUntil();
      status = opts.noLog ? '' : `<div class="status"><span class="${past ? 'chip warn' : 'faint'}">${past ? 'noch nicht protokolliert' : 'offen'}</span><button class="btn small" data-log="${esc(unit.key)}">Protokollieren</button></div>`;
    }
    return `<div class="card">
      <div class="unit-head"><div class="grow"><div class="unit-title">${esc(unit.title)}</div><div class="unit-meta row">${meta ? esc(meta) : ''} ${zone} ${opt}</div></div>
      <div class="mins">${unit.minutes ? unit.minutes + '<small> min</small>' : ''}</div></div>
      ${sectionsHTML(unit.sections, unit.text)}
      ${unit.note ? `<div class="note">${esc(unit.note)}</div>` : ''}
      ${exerciseTable(ctx, unit)}
      ${unit.ersatz ? `<details class="ersatz"><summary>Ersatz, wenn Wasser ausfällt</summary>${sectionsHTML(unit.ersatzSections, unit.ersatz)}</details>` : ''}
      ${status}
    </div>`;
  }

  function bindUnitButtons(root, ctx) {
    $$('[data-log]', root).forEach((b) => b.onclick = () => {
      const unit = ctx.plan.units.find((u) => u.key === b.dataset.log);
      const log = b.dataset.id ? ctx.logs.find((l) => l.id === b.dataset.id) : null;
      openLogForm(ctx, unit, log);
    });
    $$('[data-editlog]', root).forEach((b) => b.onclick = () => {
      const log = ctx.logs.find((l) => l.id === b.dataset.editlog);
      const unit = ctx.plan.units.find((u) => u.key === log.unitKey) || null;
      openLogForm(ctx, unit, log);
    });
    $$('details[data-x]', root).forEach((d) => d.addEventListener('toggle', () => { S.expanded[d.dataset.x] = d.open; }));
  }

  // ------------------------------------------------------------ Heute (Sportler)
  function dayNav(label, sub) {
    return `<div class="daynav"><button class="iconbtn" id="dprev" aria-label="Vorheriger Tag">${ICON.left}</button>
      <div class="title"><h1>${esc(label)}</h1><small>${esc(sub)}</small></div>
      <button class="iconbtn" id="dnext" aria-label="Nächster Tag">${ICON.right}</button></div>`;
  }
  function bindDayNav() {
    $('#dprev').onclick = () => { S.date = addDays(S.date, -1); render(); };
    $('#dnext').onclick = () => { S.date = addDays(S.date, 1); render(); };
    const t = $('#dtoday'); if (t) t.onclick = () => { S.date = todayISO(); render(); };
  }
  function dayLabel(date) {
    const t = todayISO();
    if (date === t) return 'Heute';
    if (date === addDays(t, 1)) return 'Morgen';
    if (date === addDays(t, -1)) return 'Gestern';
    return fmtShort(date);
  }

  function weekInfo(ctx, date) {
    const u = ctx.plan.units.find((x) => x.date === date) || ctx.plan.units.find((x) => mondayOf(x.date) === mondayOf(date));
    if (!u || u.week == null) return null;
    return ctx.plan.weeks.find((w) => w.week === u.week) || null;
  }

  function renderToday(app, ctx) {
    const units = ctx.plan.units.filter((u) => u.date === S.date);
    const extra = ctx.logs.filter((l) => l.date === S.date && !units.some((u) => u.key === l.unitKey));
    const wk = weekInfo(ctx, S.date);
    const total = units.reduce((s, u) => s + (u.minutes || 0), 0);
    let html = dayNav(dayLabel(S.date), fmtLong(S.date) + (wk ? ' · Woche ' + wk.week + (wk.label ? ' · ' + wk.label : '') : ''));
    if (S.date !== todayISO()) html += `<div class="row" style="justify-content:center;margin:-6px 0 12px"><button class="btn ghost small" id="dtoday">Zurück zu heute</button></div>`;
    if (wk && wk.note && S.date === mondayOf(S.date)) html += `<div class="card note" style="margin-top:0">${esc(wk.note)}</div>`;
    if (!units.length) html += '<div class="card empty">Für diesen Tag ist nichts geplant.</div>';
    if (total) html += `<div class="faint" style="margin:0 2px 8px">Geplant: ${fmtMin(total)}</div>`;
    html += units.map((u) => unitCard(ctx, u)).join('');
    if (extra.length) {
      html += '<div class="sectiontitle"><h2>Weitere Einträge an diesem Tag</h2></div>';
      html += extra.map((l) => logCard(ctx, l, true)).join('');
    }
    html += `<button class="btn secondary block mt" id="addextra">+ Zusatzeinheit eintragen</button>`;
    html += installHint();
    app.innerHTML = html;
    bindDayNav();
    bindUnitButtons(app, ctx);
    $('#addextra').onclick = () => openLogForm(ctx, null, null, S.date);
    bindInstall();
  }

  // ------------------------------------------------------------ Plan (Wochen)
  function renderPlan(app, ctx, container) {
    const target = container || app;
    if (!S.planWeekStart) S.planWeekStart = mondayOf(todayISO());
    const ws = S.planWeekStart, we = addDays(ws, 6);
    const units = ctx.plan.units.filter((u) => u.date >= ws && u.date <= we);
    const wk = units.length && units[0].week != null ? ctx.plan.weeks.find((w) => w.week === units[0].week) : null;
    const planned = units.filter((u) => u.type !== 'rest' && !u.optional).reduce((s, u) => s + (u.minutes || 0), 0);
    const done = ctx.logs.filter((l) => l.date >= ws && l.date <= we).reduce((s, l) => s + logMinutes(l), 0);
    let html = `<div class="daynav"><button class="iconbtn" id="wprev" aria-label="Vorherige Woche">${ICON.left}</button>
      <div class="title"><h1>${wk ? 'Woche ' + wk.week : 'Woche'}</h1><small>${fmtShort(ws)} – ${fmtShort(we)}${wk && wk.label ? ' · ' + esc(wk.label) : ''}</small></div>
      <button class="iconbtn" id="wnext" aria-label="Nächste Woche">${ICON.right}</button></div>`;
    if (ws !== mondayOf(todayISO())) html += `<div class="row" style="justify-content:center;margin:-6px 0 12px"><button class="btn ghost small" id="wnow">Zur aktuellen Woche</button></div>`;
    if (wk && wk.note) html += `<div class="note" style="margin:0 0 12px">${esc(wk.note)}</div>`;
    html += `<div class="kpis"><div class="kpi"><div class="v">${fmtMin(planned)}</div><div class="l">geplant</div></div><div class="kpi"><div class="v">${fmtMin(done)}</div><div class="l">protokolliert</div><div class="meter"><i style="width:${planned ? Math.min(100, done / planned * 100) : 0}%"></i></div></div></div>`;
    if (!units.length) html += '<div class="card empty">Für diese Woche gibt es keinen Plan.</div>';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const du = units.filter((u) => u.date === d);
      if (!du.length) continue;
      html += `<div class="day-label ${d === todayISO() ? 'today' : ''}">${fmtShort(d)}${d === todayISO() ? ' · heute' : ''}</div>`;
      du.forEach((u) => {
        const open = S.expanded['u' + u.key];
        if (open) {
          html += `<div data-collapse="${esc(u.key)}">${unitCard(ctx, u)}</div>`;
        } else {
          const logged = logsForUnit(ctx, u).length > 0;
          html += `<div class="card compact" data-expand="${esc(u.key)}"><span class="dot ${u.type === 'rest' ? 'rest' : logged ? 'done' : ''}"></span>
            <div class="t"><b>${esc(u.title)}</b><span class="faint">${esc([u.time, u.zone].filter(Boolean).join(' · '))}</span></div>
            <span class="mins">${u.minutes ? u.minutes + '<small> min</small>' : ''}</span></div>`;
        }
      });
    }
    target.innerHTML = html;
    $('#wprev', target).onclick = () => { S.planWeekStart = addDays(ws, -7); rerender(); };
    $('#wnext', target).onclick = () => { S.planWeekStart = addDays(ws, 7); rerender(); };
    const now = $('#wnow', target); if (now) now.onclick = () => { S.planWeekStart = mondayOf(todayISO()); rerender(); };
    $$('[data-expand]', target).forEach((el) => el.onclick = () => { S.expanded['u' + el.dataset.expand] = true; rerender(); });
    $$('[data-collapse] .unit-head', target).forEach((el) => { el.style.cursor = 'pointer'; el.onclick = () => { S.expanded['u' + el.closest('[data-collapse]').dataset.collapse] = false; rerender(); }; });
    bindUnitButtons(target, ctx);
    function rerender() { if (container) renderPlan(app, ctx, container); else render(); }
  }

  // ------------------------------------------------------------ Auswertung
  // Tages-Deadline: Erst ab 21 Uhr zählt der heutige Tag als „fällig“ (Soll, offene Einheiten, Serie).
  // Vorher zählen heutige Einheiten nur, wenn sie schon protokolliert sind.
  const DEADLINE_HOUR = 21;
  function dueUntil() { const t = todayISO(); return new Date().getHours() >= DEADLINE_HOUR ? t : addDays(t, -1); }
  function computeStats(ctx) {
    const start = ctx.settings.startDate;
    const today = todayISO();
    const units = ctx.plan.units.filter((u) => u.type !== 'rest' && u.date >= start);
    const deadline = dueUntil();
    const logs = ctx.logs.filter((l) => l.date >= start && l.date <= today).sort((a, b) => a.date.localeCompare(b.date));
    const logged = new Set(logs.map((l) => l.unitKey));
    const due = units.filter((u) => !u.optional && (u.date <= deadline || (u.date === today && logged.has(u.key))));
    const plannedMin = due.reduce((s, u) => s + (u.minutes || 0), 0);
    const doneMin = logs.reduce((s, l) => s + logMinutes(l), 0);
    const open = due.filter((u) => u.date <= deadline && !logged.has(u.key));
    const dueLogged = due.filter((u) => logged.has(u.key)).length;
    // Serie: Trainingstage in Folge, an denen alle geplanten Einheiten erledigt wurden (Ruhetage zählen nicht, heute erst wenn erledigt)
    const byDay = {};
    units.filter((u) => !u.optional && u.date <= today).forEach((u) => { (byDay[u.date] = byDay[u.date] || []).push(u); });
    let streak = 0, bestStreak = 0;
    Object.keys(byDay).sort().forEach((day) => {
      const done = byDay[day].every((u) => logged.has(u.key));
      if (done) { streak++; bestStreak = Math.max(bestStreak, streak); }
      else if (day <= deadline) streak = 0;
    });
    const rpeLogs = logs.filter((l) => l.rpe);
    const ausd = logs.filter((l) => l.type === 'ausdauer');
    const shots = ausd.filter((l) => l.screenshot).length;
    let hintsTotal = 0, hintsDone = 0;
    logs.forEach((l) => (l.hints || []).forEach((h) => { hintsTotal++; if (h.done) hintsDone++; }));
    // Wochen
    const weeks = [];
    let w = mondayOf(start);
    const lastW = mondayOf(today);
    while (w <= lastW) {
      const we = addDays(w, 6);
      const p = units.filter((u) => u.date >= w && u.date <= we && !u.optional && u.date >= start).reduce((s, u) => s + (u.minutes || 0), 0);
      const d = logs.filter((l) => l.date >= w && l.date <= we).reduce((s, l) => s + logMinutes(l), 0);
      const r = logs.filter((l) => l.date >= w && l.date <= we && l.rpe);
      weeks.push({ start: w, planned: p, done: d, rpe: r.length ? r.reduce((s, l) => s + l.rpe, 0) / r.length : null });
      w = addDays(w, 7);
    }
    const sports = {};
    logs.forEach((l) => {
      const ps = logParts(l);
      if (!ps.length) { const k = l.type === 'kraft' ? 'Kraft' : (l.sport || 'Sonstiges'); sports[k] = sports[k] || { min: 0, km: 0, n: 0 }; sports[k].min += logMinutes(l); sports[k].n++; return; }
      ps.forEach((p) => { const k = p.sport || 'Sonstiges'; sports[k] = sports[k] || { min: 0, km: 0, n: 0 }; sports[k].min += Number(String(p.minutes).replace(',', '.')) || 0; sports[k].km += Number(String(p.km).replace(',', '.')) || 0; sports[k].n++; });
    });
    const weights = {};
    ctx.logs.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((l) => (l.weights || []).forEach((x) => {
      if (x.kg == null) return;
      (weights[x.name] = weights[x.name] || []).push({ date: l.date, kg: x.kg });
    }));
    const weekStart = mondayOf(today);
    const thisWeekPlanned = due.filter((u) => u.date >= weekStart).reduce((s, u) => s + (u.minutes || 0), 0);
    const thisWeekDone = logs.filter((l) => l.date >= weekStart).reduce((s, l) => s + logMinutes(l), 0);
    const last7 = logs.filter((l) => l.date >= addDays(today, -6) && l.rpe);
    return {
      start, plannedMin, doneMin, pct: plannedMin ? doneMin / plannedMin : null, open, due: due.length, dueLogged,
      rpeAvg: rpeLogs.length ? rpeLogs.reduce((s, l) => s + l.rpe, 0) / rpeLogs.length : null,
      rpe7: last7.length ? last7.reduce((s, l) => s + l.rpe, 0) / last7.length : null,
      shots, ausd: ausd.length, hintsTotal, hintsDone, weeks, sports, weights, logs,
      streak, bestStreak,
      thisWeekPlanned, thisWeekDone, lastLog: logs.length ? logs[logs.length - 1].date : null,
      km: logs.reduce((s, l) => s + (l.km || 0), 0)
    };
  }

  const pctTxt = (p) => p == null ? '–' : Math.round(p * 100) + ' %';
  function pctChip(p) {
    if (p == null) return '<span class="chip">–</span>';
    const cls = p >= 0.98 ? 'good' : p >= 0.875 ? 'warn' : 'bad';
    return `<span class="chip ${cls}">${pctTxt(p)}</span>`;
  }

  function weeklyChart(weeks) {
    if (!weeks.length) return '';
    const W = chartW(), H = 200, padL = 40, padB = 26, padT = 10;
    const max = Math.max(60, ...weeks.map((w) => Math.max(w.planned, w.done)));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const n = weeks.length;
    const slot = (W - padL - 6) / n;
    const bw = Math.min(26, slot * 0.36);
    const y = (v) => padT + (H - padT - padB) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top; v += step) g += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    let bars = '';
    weeks.forEach((w, i) => {
      const cx = padL + slot * i + slot / 2;
      const lbl = fmtShort(w.start).slice(4);
      const tip = `Woche ab ${fmtShort(w.start)}\nGeplant: ${fmtMin(w.planned)}\nProtokolliert: ${fmtMin(w.done)}${w.planned ? '\nErreicht: ' + pctTxt(w.done / w.planned) : ''}${w.rpe ? '\nØ RPE: ' + fmtNum(w.rpe, 1) : ''}`;
      bars += `<g class="hov" data-tip="${esc(tip)}"><rect x="${cx - slot / 2}" y="${padT}" width="${slot}" height="${H - padT - padB}" fill="transparent"/>
        ${roundedBar(cx - bw - 1, y(w.planned), bw, y(0) - y(w.planned), 'var(--plan)')}
        ${roundedBar(cx + 1, y(w.done), bw, y(0) - y(w.done), 'var(--accent)')}
        <text x="${cx}" y="${H - 8}" text-anchor="middle">${lbl}</text></g>`;
    });
    return `<div class="legend"><span><i style="background:var(--plan)"></i>Geplant (min)</span><span><i style="background:var(--accent)"></i>Protokolliert (min)</span></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minuten pro Woche, geplant und protokolliert">${g}${bars}</svg>`;
  }
  function chartW() { const el = document.getElementById('app'); return Math.max(300, Math.min(820, (el ? el.clientWidth : 360) - 66)); }
  function roundedBar(x, y, w, h, fill) {
    if (h <= 0) return '';
    const r = Math.min(4, h, w / 2);
    return `<path d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z" fill="${fill}"/>`;
  }
  function niceStep(max) {
    const raw = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  function rpeChart(logs) {
    const pts = logs.filter((l) => l.rpe);
    if (pts.length < 2) return '<div class="faint">Sobald mehrere Einheiten mit RPE eingetragen sind, erscheint hier der Verlauf.</div>';
    const W = chartW(), H = 150, padL = 28, padB = 22, padT = 10;
    const n = pts.length;
    const x = (i) => padL + (W - padL - 10) * (n === 1 ? 0.5 : i / (n - 1));
    const y = (v) => padT + (H - padT - padB) * (1 - (v - 1) / 9);
    let g = '';
    [1, 4, 7, 10].forEach((v) => g += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.rpe).toFixed(1)).join(' ');
    const dots = pts.map((p, i) => `<g class="hov" data-tip="${esc(fmtShort(p.date) + '\n' + p.title + '\nRPE ' + p.rpe)}"><circle cx="${x(i)}" cy="${y(p.rpe)}" r="10" fill="transparent"/><circle cx="${x(i)}" cy="${y(p.rpe)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>`).join('');
    const first = pts[0].date, last = pts[n - 1].date;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="RPE-Verlauf">${g}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}
      <text x="${padL}" y="${H - 5}">${fmtShort(first)}</text><text x="${W - 4}" y="${H - 5}" text-anchor="end">${fmtShort(last)}</text></svg>`;
  }

  function bindTips(root) {
    let tip = $('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
    $$('.hov', root).forEach((g) => {
      const show = (e) => {
        tip.textContent = g.dataset.tip;
        tip.style.opacity = 1;
        const pt = e.touches ? e.touches[0] : e;
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, pt.clientX - tw / 2)) + 'px';
        tip.style.top = (pt.clientY - tip.offsetHeight - 14) + 'px';
      };
      g.addEventListener('mousemove', show);
      g.addEventListener('touchstart', show, { passive: true });
      g.addEventListener('mouseleave', () => tip.style.opacity = 0);
    });
    document.addEventListener('touchstart', (e) => { if (!e.target.closest('.hov')) tip.style.opacity = 0; }, { passive: true });
  }

  function statsHTML(ctx) {
    const st = computeStats(ctx);
    let html = '';
    html += `<div class="kpis">
      <div class="kpi"><div class="l">Trainingsminuten erreicht</div><div class="v">${pctTxt(st.pct)}</div><div class="s">${fmtMin(st.doneMin)} von ${fmtMin(st.plannedMin)}</div><div class="meter"><i style="width:${Math.min(100, (st.pct || 0) * 100)}%"></i></div></div>
      <div class="kpi"><div class="l">Diese Woche</div><div class="v">${fmtMin(st.thisWeekDone)}</div><div class="s">von ${fmtMin(st.thisWeekPlanned)} fällig (Tagesende 21 Uhr)</div></div>
      <div class="kpi"><div class="l">Einheiten protokolliert</div><div class="v">${st.dueLogged}/${st.due}</div><div class="s">${st.open.length ? st.open.length + ' offen' : 'alles eingetragen'}</div></div>
      <div class="kpi"><div class="l">Ø RPE</div><div class="v">${st.rpeAvg ? fmtNum(st.rpeAvg, 1) : '–'}</div><div class="s">letzte 7 Tage: ${st.rpe7 ? fmtNum(st.rpe7, 1) : '–'}</div></div>
      <div class="kpi"><div class="l">Vorgaben umgesetzt</div><div class="v">${st.hintsTotal ? st.hintsDone + '/' + st.hintsTotal : '–'}</div><div class="s">Intervalle & Tests</div></div>
      <div class="kpi"><div class="l">Serie</div><div class="v">${st.streak} ${st.streak === 1 ? 'Tag' : 'Tage'}</div><div class="s">alles erledigt in Folge · Rekord ${st.bestStreak}</div></div>
      ${ctx.isCoach ? `<div class="kpi"><div class="l">Screenshots</div><div class="v">${st.ausd ? st.shots + '/' + st.ausd : '–'}</div><div class="s">bei Ausdauer-Einheiten</div></div>` : ''}
    </div>`;
    html += `<div class="card"><h2>Minuten pro Woche</h2><div class="faint">seit ${fmtShort(st.start)}</div>${weeklyChart(st.weeks)}</div>`;
    html += `<div class="card"><h2>Belastungsempfinden (RPE)</h2>${rpeChart(st.logs)}</div>`;
    const sp = Object.entries(st.sports).sort((a, b) => b[1].min - a[1].min);
    if (sp.length) {
      const mx = sp[0][1].min || 1;
      html += `<div class="card"><h2>Nach Sportart</h2>${sp.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><span class="bar"><i style="width:${v.min / mx * 100}%"></i></span><span class="n">${fmtMin(v.min)}${v.km ? '<br><small>' + fmtNum(v.km, 1) + ' km</small>' : ''}</span></div>`).join('')}</div>`;
    }
    const wk = Object.entries(st.weights);
    if (wk.length) {
      html += `<div class="card"><h2>Kraft-Entwicklung</h2><div class="tablewrap"><table><thead><tr><th>Übung</th><th class="num">Erstes</th><th class="num">Aktuell</th><th class="num">Δ</th><th>Verlauf</th></tr></thead><tbody>
        ${wk.map(([n, arr]) => { const f = arr[0].kg, l = arr[arr.length - 1].kg, d = l - f; return `<tr><td>${esc(n)}</td><td class="num">${fmtNum(f, 1)} kg</td><td class="num"><b>${fmtNum(l, 1)} kg</b></td><td class="num">${d > 0 ? '+' : ''}${fmtNum(d, 1)}</td><td class="faint">${arr.slice(-6).map((x) => fmtNum(x.kg, 1)).join(' → ')}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
    }
    if (st.open.length) {
      html += `<div class="card"><h2>Noch nicht protokolliert</h2><div class="faint">Geplante Einheiten in der Vergangenheit ohne Eintrag</div>
        <div class="tablewrap"><table><tbody>${st.open.slice(-15).reverse().map((u) => `<tr><td>${fmtShort(u.date)}</td><td>${esc(u.title)}</td><td class="num">${u.minutes} min</td><td class="num"><button class="btn small secondary" data-log="${esc(u.key)}">Eintragen</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    return html;
  }

  function logParts(l) {
    if (l.parts && l.parts.length) return l.parts;
    if (l.type === 'kraft') return [];
    return [{ sport: l.sport || 'Sonstiges', minutes: l.minutes != null ? l.minutes : l.planMinutes, km: l.km, hr: l.hr }];
  }
  function partsLine(l) {
    const ps = l.parts || [];
    if (ps.length < 2) return '';
    const n = (v) => { if (v === '' || v == null) return null; const x = Number(String(v).replace(',', '.')); return isNaN(x) ? null : x; };
    return ps.map((p) => { const m = n(p.minutes), k = n(p.km), hr = n(p.hr); return [p.sport, m != null ? m + ' min' : '', k != null ? fmtNum(k, 2) + ' km' : '', hr != null ? 'HF ' + hr : ''].filter(Boolean).join(' '); }).join(' · ');
  }
  function logCard(ctx, l, withTitleDate) {
    const lines = [];
    const pl = partsLine(l);
    if (pl) lines.push(pl);
    if (l.ersatz) lines.push('Ersatz-Programm');
    if (l.hints && l.hints.length) lines.push(l.hints.map((h) => (h.done ? '✓ ' : '✗ ') + h.text).join('\n'));
    if (l.weights && l.weights.length) lines.push(l.weights.filter((w) => w.kg != null).map((w) => w.name + ': ' + fmtNum(w.kg, 1) + ' kg').join(' · '));
    if (l.ergo) lines.push('Ergo: ' + l.ergo + (l.split ? ' · Split ' + l.split : ''));
    else if (l.split) lines.push('Split: ' + l.split);
    if (l.comment) lines.push('„' + l.comment + '“');
    const files = ctx.isCoach && l.files && l.files.length ? `<div class="row mt">${l.files.map((f, i) => `<a class="chip zone" href="${esc(f.url)}" target="_blank" rel="noopener">Foto ${i + 1}${f.part ? ' · ' + esc(f.part) : ''}</a>`).join('')}</div>` : '';
    return `<div class="card"><div class="row between"><div><b>${esc(l.title || 'Einheit')}</b> <span class="faint">${withTitleDate ? '' : fmtShort(l.date)}${l.planDate && l.planDate !== l.date ? ' · geplant ' + fmtShort(l.planDate) : ''}</span></div>
      <div class="row">${l.screenshot ? '<span class="chip good">Screenshot ✓</span>' : (l.type === 'ausdauer' ? '<span class="chip warn">kein Screenshot</span>' : '')}<button class="btn small secondary" data-editlog="${esc(l.id)}">Bearbeiten</button></div></div>
      <div class="logline">${esc(logSummary(l))}${l.planMinutes ? ' (geplant ' + l.planMinutes + ' min)' : ''}${l.sport && !pl ? ' · ' + esc(l.sport) : ''}</div>
      ${lines.length ? `<div class="logline">${esc(lines.join('\n'))}</div>` : ''}${files}</div>`;
  }

  function logsHTML(ctx) {
    const logs = ctx.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.ts).localeCompare(String(a.ts)));
    if (!logs.length) return '<div class="card empty">Noch keine Einträge.</div>';
    return `<div class="loglist">${logs.map((l) => logCard(ctx, l)).join('')}</div>`;
  }

  function renderStats(app, ctx) {
    app.innerHTML = `<h1 style="margin-bottom:12px">Meine Auswertung</h1>${statsHTML(ctx)}<div class="sectiontitle"><h2>Mein Trainingsprotokoll</h2></div>${logsHTML(ctx)}`;
    bindUnitButtons(app, ctx);
    bindTips(app);
  }

  // ------------------------------------------------------------ Hall of Fame
  async function renderHall(app) {
    app.innerHTML = '<h1>Hall of Fame</h1><div class="loading">Lädt …</div>';
    if (!S.hall) {
      try { S.hall = (await api('hall')).hall; } catch (e) { app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
    }
    const mode = S.hallMode;
    const list = S.hall.slice().sort((a, b) => (mode === 'week' ? b.week - a.week : b.minutes - a.minutes) || a.name.localeCompare(b.name, 'de'));
    const max = Math.max(1, ...list.map((x) => mode === 'week' ? x.week : x.minutes));
    const start = (S.coach || S.data).settings.startDate;
    let rank = 0, prev = null;
    const rows = list.map((x, i) => {
      const v = mode === 'week' ? x.week : x.minutes;
      if (v !== prev) rank = i + 1;
      prev = v;
      const me = S.user && x.name === S.user.name;
      return `<div class="hof-row ${me ? 'me' : ''}"><div class="rank ${rank <= 3 && v > 0 ? 'r' + rank : ''}">${rank}</div>
        <div><b>${esc(x.name)}</b> <span class="faint">${esc(x.group ? 'Junioren ' + x.group : '')}</span><div class="bar"><i style="width:${v / max * 100}%"></i></div></div>
        <div class="v">${fmtNum(v)} min<small>${mode === 'week' ? (x.weekSessions != null ? x.weekSessions : '') : x.sessions} Einheit${(mode === 'week' ? x.weekSessions : x.sessions) === 1 ? '' : 'en'}</small></div></div>`;
    }).join('');
    const total = list.reduce((s, x) => s + (mode === 'week' ? x.week : x.minutes), 0);
    app.innerHTML = `<div class="sectiontitle" style="margin-top:0"><h1>Hall of Fame</h1>
      <div class="seg"><button data-m="total" class="${mode === 'total' ? 'active' : ''}">Gesamt</button><button data-m="week" class="${mode === 'week' ? 'active' : ''}">Diese Woche</button></div></div>
      <p class="faint" style="margin-top:-4px">${mode === 'week' ? 'Protokollierte Minuten seit Montag' : 'Protokollierte Minuten seit ' + fmtShort(start)} · Team gesamt: ${fmtMin(total)}</p>
      <div class="card">${rows || '<div class="empty">Noch keine Einträge</div>'}</div>`;
    $$('.seg button', app).forEach((b) => b.onclick = () => { S.hallMode = b.dataset.m; renderHall(app); });
  }

  // ------------------------------------------------------------ Trainer: Heute
  function renderCoachToday(app) {
    const C = S.coach;
    const groups = {};
    C.athletes.forEach((a) => { (groups[a.plan] = groups[a.plan] || []).push(a); });
    let html = dayNav(dayLabel(S.date), fmtLong(S.date));
    if (S.date !== todayISO()) html += `<div class="row" style="justify-content:center;margin:-6px 0 12px"><button class="btn ghost small" id="dtoday">Zurück zu heute</button></div>`;
    const order = ['Junioren A', 'Junioren B'].concat(Object.keys(groups).filter((k) => !['Junioren A', 'Junioren B'].includes(k)));
    order.forEach((planName) => {
      const ath = groups[planName];
      if (!ath) return;
      const plan = C.plans[planName] || { units: [] };
      const units = plan.units.filter((u) => u.date === S.date);
      const real = units.filter((u) => u.type !== 'rest');
      const total = real.reduce((s, u) => s + (u.minutes || 0), 0);
      html += `<div class="card"><div class="row between"><h2>${esc(planName)}</h2><span class="faint">${total ? fmtMin(total) : 'frei'}</span></div>`;
      if (!units.length) html += '<div class="faint mt">Nichts geplant.</div>';
      units.forEach((u) => {
        const key = 'c' + u.key;
        html += `<div class="compact" style="padding:8px 0;margin:0;border-bottom:1px solid var(--line)" data-cexp="${esc(key)}"><span class="dot ${u.type === 'rest' ? 'rest' : ''}"></span><div class="t"><b>${esc(u.title)}</b><span class="faint">${esc([u.time, u.zone].filter(Boolean).join(' · '))}</span></div><span class="mins">${u.minutes ? u.minutes + '<small> min</small>' : ''}</span></div>`;
        if (S.expanded[key]) {
          const ctx = { plan, kraft: ath[0].kraft ? C.kraft[ath[0].kraft] : null, logs: [], settings: C.settings, isCoach: true };
          html += `<div style="margin-top:8px">${unitCard(ctx, u, { noLog: true }).replace('class="card"', 'class="card" style="box-shadow:none;background:var(--surface-2)"')}</div>`;
        }
      });
      html += '<div class="chips">' + ath.map((a) => {
        const done = real.filter((u) => C.logs.some((l) => l.athlete === a.name && l.unitKey === u.key)).length;
        const cls = !real.length ? '' : done === real.length ? 'good' : done ? 'warn' : '';
        const label = real.length ? ` ${done}/${real.length}` : '';
        return `<span class="chip ${cls}" data-ath="${esc(a.name)}">${esc(a.name)}${label}</span>`;
      }).join('') + '</div></div>';
    });
    app.innerHTML = html;
    bindDayNav();
    $$('[data-cexp]', app).forEach((el) => el.onclick = () => { S.expanded[el.dataset.cexp] = !S.expanded[el.dataset.cexp]; render(); });
    $$('[data-ath]', app).forEach((el) => el.onclick = () => openAthlete(el.dataset.ath));
  }

  function openAthlete(name) { S.coachAthlete = name; S.view = 'athlete'; S.coachTab = 'stats'; S.planWeekStart = null; render(); window.scrollTo(0, 0); }

  // ------------------------------------------------------------ Trainer: Sportler-Übersicht
  function renderTeam(app) {
    const C = S.coach;
    const rows = C.athletes.map((a) => ({ a, st: computeStats(athleteCtx(a.name)) }));
    const sortKey = S.teamSort || 'group';
    rows.sort((x, y) => {
      if (sortKey === 'pct') return (x.st.pct || 0) - (y.st.pct || 0);
      if (sortKey === 'name') return x.a.name.localeCompare(y.a.name, 'de');
      return x.a.plan.localeCompare(y.a.plan, 'de') || x.a.name.localeCompare(y.a.name, 'de');
    });
    const sum = rows.reduce((s, r) => { s.p += r.st.plannedMin; s.d += r.st.doneMin; return s; }, { p: 0, d: 0 });
    app.innerHTML = `<div class="sectiontitle" style="margin-top:0"><h1>Sportler</h1>
      <div class="seg"><button data-s="group" class="${sortKey === 'group' ? 'active' : ''}">Gruppe</button><button data-s="name" class="${sortKey === 'name' ? 'active' : ''}">Name</button><button data-s="pct" class="${sortKey === 'pct' ? 'active' : ''}">Erreicht</button></div></div>
      <p class="faint" style="margin-top:-4px">Seit ${fmtShort(C.settings.startDate)} bis heute · Team: ${fmtMin(sum.d)} von ${fmtMin(sum.p)} (${pctTxt(sum.p ? sum.d / sum.p : null)})</p>
      <div class="card" style="padding:6px 10px"><div class="tablewrap"><table>
      <thead><tr><th>Sportler</th><th class="num">Erreicht</th><th class="num">Ist / Soll</th><th class="num">Woche</th><th class="num">Offen</th><th class="num">Ø RPE 7T</th><th class="num">Screens</th><th>Letzter Eintrag</th></tr></thead>
      <tbody>${rows.map(({ a, st }) => `<tr class="click" data-ath="${esc(a.name)}"><td><b>${esc(a.name)}</b><div class="faint">${esc(a.plan)}</div></td>
        <td class="num">${pctChip(st.pct)}</td><td class="num">${fmtNum(st.doneMin)} / ${fmtNum(st.plannedMin)}</td>
        <td class="num">${fmtNum(st.thisWeekDone)} / ${fmtNum(st.thisWeekPlanned)}</td>
        <td class="num">${st.open.length ? `<span class="chip warn">${st.open.length}</span>` : '0'}</td>
        <td class="num">${st.rpe7 ? fmtNum(st.rpe7, 1) : '–'}</td>
        <td class="num">${st.ausd ? st.shots + '/' + st.ausd : '–'}</td>
        <td>${st.lastLog ? fmtShort(st.lastLog) : '<span class="faint">–</span>'}</td></tr>`).join('')}</tbody></table></div></div>
      <button class="btn secondary block mt" id="reload">Plan & Daten neu laden</button>`;
    $$('.seg button', app).forEach((b) => b.onclick = () => { S.teamSort = b.dataset.s; render(); });
    $$('[data-ath]', app).forEach((el) => el.onclick = () => openAthlete(el.dataset.ath));
    $('#reload').onclick = async () => { $('#reload').disabled = true; await reloadData(); toast('Aktualisiert'); };
  }

  function renderCoachAthlete(app) {
    const ctx = athleteCtx(S.coachAthlete);
    if (!ctx) { S.view = 'team'; return render(); }
    const tab = S.coachTab;
    app.innerHTML = `<button class="btn ghost back" id="back">${ICON.left} Alle Sportler</button>
      <div class="sectiontitle" style="margin-top:0"><div><h1>${esc(ctx.athlete.name)}</h1><div class="faint">${esc(ctx.athlete.plan)}${ctx.athlete.kraft ? ' · ' + esc(ctx.athlete.kraft) : ''}</div></div>
      <div class="seg"><button data-t="stats" class="${tab === 'stats' ? 'active' : ''}">Auswertung</button><button data-t="logs" class="${tab === 'logs' ? 'active' : ''}">Protokoll</button><button data-t="plan" class="${tab === 'plan' ? 'active' : ''}">Plan</button></div></div>
      <div id="cbody"></div>`;
    $('#back').onclick = () => { S.view = 'team'; render(); };
    $$('.seg button', app).forEach((b) => b.onclick = () => { S.coachTab = b.dataset.t; render(); });
    const body = $('#cbody');
    if (tab === 'stats') { body.innerHTML = statsHTML(ctx); bindUnitButtons(body, ctx); bindTips(body); }
    else if (tab === 'logs') { body.innerHTML = logsHTML(ctx); bindUnitButtons(body, ctx); }
    else renderPlan(app, ctx, body);
  }

  // ------------------------------------------------------------ Bestandteile aus dem Ablauf erkennen
  const SPORTS = ['Rudern', 'Ruderbecken', 'Ergo', 'Rad/Spinning', 'Laufen', 'Schwimmen', 'Hallensport', 'Mobilisation', 'Dehnen', 'Rumpf/Athletik', 'Mobilität/Yoga', 'Sonstiges'];
  const SPORT_KEYS = [
    ['Ruderbecken', /ruderbecken/i],
    ['Mobilisation', /mobilisation|mobi\b|mobi-|mobilisier/i],
    ['Dehnen', /dehnen|stretch|faszienrolle/i],
    ['Rumpf/Athletik', /rumpf|core|stabi|athletik|plank/i],
    ['Ergo', /ergo/i],
    ['Rad/Spinning', /bike|spinning|\brad\b|rad\/|einrollen|radfahren/i],
    ['Laufen', /lauf|traben|jogg/i],
    ['Schwimmen', /schwimm/i],
    ['Hallensport', /halle|hallensport|spiele/i],
    ['Mobilität/Yoga', /yoga|mobilität/i],
    ['Rudern', /rudern|einrudern|ausrudern|boot|kleinboot/i]
  ];
  function sportOf(text, fallback) {
    let best = null, pos = Infinity;
    SPORT_KEYS.forEach(([s, re]) => { const m = re.exec(text); if (m && m.index < pos) { pos = m.index; best = s; } });
    // "einrudern/ausrudern" in einer Ergo-Einheit = Ergo
    if (best === 'Rudern' && fallback === 'Ergo' && !/boot|wasser/i.test(text)) best = 'Ergo';
    return best || fallback || 'Sonstiges';
  }
  function sportOrNull(text) {
    let best = null, pos = Infinity;
    SPORT_KEYS.forEach(([s, re]) => { const m = re.exec(text); if (m && m.index < pos) { pos = m.index; best = s; } });
    return best;
  }
  function partsFromUnit(unit, ersatz) {
    const sec = ersatz ? unit.ersatzSections : unit.sections;
    let base = unit.sport;
    if (!base || base === 'Sonstiges') base = sportOrNull(ersatz ? unit.ersatz : unit.text + ' ' + unit.title) || base;
    if (ersatz) base = 'Ergo';
    let parts = partsFromSections(sec, base);
    if (!parts.length && unit.minutes) parts = [{ sport: ersatz ? 'Ergo' : (unit.sport || 'Sonstiges'), minutes: unit.minutes, km: '', hr: '' }];
    return parts;
  }
  function partsFromSections(sec, unitSport) {
    if (!sec) return [];
    const fb = unitSport && unitSport !== 'Kraft' ? unitSport : 'Sonstiges';
    const raw = [];
    ['warmup', 'main', 'cooldown', 'other'].forEach((k) => {
      const t = sec[k];
      if (!t) return;
      const hm = t.match(/^(?:warm[\s-]?up|hauptteil|cool[\s-]?down)\s*\((\d+)\s*['’]?\s*\)\s*:?\s*/i);
      const total = hm ? Number(hm[1]) : null;
      let body = hm ? t.slice(hm[0].length) : t;
      const secSport = sportOrNull(body.slice(0, 30)) || sportOf(body, fb);
      const restSport = sportOrNull(body.slice(0, 30)) || fb;
      // Intervall-Details entfernen: "darin 3×10' Z3 ... dazwischen", "3×15'", "dazwischen 3' locker", Klammern
      let clean = body
        .replace(/\([^)]*\)/g, ' ')
        .replace(/,?\s*darin\b[^+]*?(?=\s\+\s|$)/gi, ' ')
        .replace(/\bmit\s+(?:je\s+)?\d+\s*(?:['’]|min\b)[^,+]*?dazwischen/gi, ' ')
        .replace(/\bdazwischen\s+\d+\s*(?:['’]|min\b)[^,.+]*/gi, ' ')
        .replace(/\d+\s*[×x]\s*\d+(?:[.,]\d+)?\s*(?:['’]|min\b|s\b|m\b|km\b)?/g, ' ');
      const segs = [];
      const re = /(\d+)\s*(?:['’]|min\b)\s*([^,;+\n]*)/g;
      let m;
      while ((m = re.exec(clean)) !== null) {
        const before = clean.slice(Math.max(0, m.index - 16), m.index);
        let sp = sportOrNull(m[2]) || sportOrNull(before) || secSport;
        if (sp === 'Rudern' && fb === 'Ergo' && !/boot|wasser/i.test(m[2])) sp = 'Ergo';
        segs.push({ min: Number(m[1]), sport: sp });
      }
      const sum = segs.reduce((s, x) => s + x.min, 0);
      if (segs.length && (total == null || sum === total)) segs.forEach((x) => raw.push(x));
      else if (segs.length && total && sum < total) { raw.push({ min: total - sum, sport: restSport }); segs.forEach((x) => raw.push(x)); }
      else if (total) raw.push({ min: total, sport: secSport });
    });
    // gleiche Sportarten zusammenfassen (Reihenfolge des ersten Auftretens)
    const out = [];
    const water = /boot|wasser|kleinboot/i.test(Object.values(sec).join(' '));
    raw.forEach((x) => {
      if (x.sport === 'Rudern' && fb === 'Ergo' && !water) x.sport = 'Ergo';
      const ex = out.find((o) => o.sport === x.sport);
      if (ex) ex.minutes += x.min; else out.push({ sport: x.sport, minutes: x.min, km: '', hr: '' });
    });
    return out;
  }

  // ------------------------------------------------------------ Protokoll-Formular

  function lastWeight(ctx, name, beforeDate) {
    const logs = ctx.logs.filter((l) => l.date <= beforeDate && (l.weights || []).some((w) => w.name === name && w.kg != null))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!logs.length) return null;
    const w = logs[0].weights.find((x) => x.name === name && x.kg != null);
    return { kg: w.kg, date: logs[0].date };
  }

  function openLogForm(ctx, unit, log, date) {
    const isExtra = !unit;
    const d = log ? log.date : unit ? (unit.date > todayISO() ? todayISO() : unit.date) : date;
    const type = log ? log.type : unit ? unit.type : 'ausdauer';
    const st = {
      type: type === 'rest' ? 'ausdauer' : type,
      ersatz: log ? log.ersatz : false,
      rpe: log ? log.rpe : null,
      files: [],
      hints: null,
      parts: null
    };
    const emptyPart = () => ({ sport: '', minutes: '', km: '', hr: '' });
    const clonePart = (p) => ({ sport: p.sport || '', minutes: p.minutes == null ? '' : p.minutes, km: p.km == null ? '' : p.km, hr: p.hr == null ? '' : p.hr });
    if (log && log.parts && log.parts.length) st.parts = log.parts.map(clonePart);
    else if (log && log.type !== 'kraft') st.parts = [clonePart({ sport: log.sport, minutes: log.minutes, km: log.km, hr: log.hr })];
    else if (unit && unit.type !== 'kraft') st.parts = partsFromUnit(unit, false).map(clonePart);
    else st.parts = [];
    if (st.type !== 'kraft' && !st.parts.length) st.parts = [emptyPart()];
    const prevHints = log && log.hints ? log.hints : [];
    const hintList = () => {
      const src = unit ? (st.ersatz && unit.hintsErsatz && unit.hintsErsatz.length ? unit.hintsErsatz : unit.hints) : [];
      const extraPrev = prevHints.filter((h) => !src.includes(h.text)).map((h) => h.text);
      return src.concat(log && !st.ersatzChanged ? extraPrev : []);
    };
    const exList = () => {
      const ex = unit ? kraftExercises(ctx, unit) : { list: [] };
      let names = ex.list.filter((e) => e.weighted !== false && !/^ergo/i.test(e.block || '')).map((e) => ({ name: e.name, info: [e.sets && e.reps ? e.sets + '×' + e.reps : e.reps, e.material].filter(Boolean).join(' · ') }));
      if (log && log.weights) log.weights.forEach((w) => { if (!names.some((n) => n.name === w.name)) names.push({ name: w.name, info: '' }); });
      return names;
    };

    const root = $('#modal-root');
    const title = unit ? unit.title : (log ? log.title : 'Zusatzeinheit');
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Einheit protokollieren">
      <div class="modal-head"><div><h2>${esc(title)}</h2><div class="faint">${unit ? 'Plan: ' + fmtLong(unit.date) : fmtLong(d)}${unit && unit.minutes ? ' · ' + unit.minutes + ' min' : ''}${ctx.isCoach ? ' · für ' + esc(ctx.athlete.name) : ''}</div></div>
      <button class="iconbtn" id="mclose" aria-label="Schließen">✕</button></div>
      <p class="faint" style="margin:4px 0 0">Alle Felder sind optional.</p>
      <div id="mbody"></div>
      <div class="err" id="merr"></div>
      <div class="sticky-actions">${log ? '<button class="btn danger" id="mdel">Löschen</button>' : ''}<button class="btn secondary" id="mcancel">Abbrechen</button><button class="btn grow" id="msave">Speichern</button></div>
    </div></div>`;

    const body = $('#mbody');
    function draw() {
      const isKraft = st.type === 'kraft';
      let h = '';
      if (isExtra) {
        h += `<div class="formsec"><h3>Einheit</h3>
          <label class="f">Bezeichnung</label><input class="in" id="ftitle" value="${esc(log ? log.title : '')}" placeholder="z. B. Lauf, Schwimmen, Kraft">
          <div class="grid2"><div><label class="f">Datum</label><input class="in" type="date" id="fdate" value="${esc(d)}"></div>
          <div><label class="f">Art</label><select class="in" id="ftype"><option value="ausdauer" ${!isKraft ? 'selected' : ''}>Ausdauer</option><option value="kraft" ${isKraft ? 'selected' : ''}>Kraft</option></select></div></div></div>`;
      }
      if (!isExtra) {
        const moved = unit && snapDate() !== unit.date;
        h += `<div class="formsec"><h3>Wann trainiert?</h3><label class="f">Durchgeführt am</label><input class="in" type="date" id="fdate" value="${esc(d)}" max="${todayISO()}">
          <div class="faint" style="margin-top:6px">Geplant für ${unit ? fmtLong(unit.date) : '–'}${moved ? ' – verschoben' : ''}</div></div>`;
      }
      if (unit && unit.ersatz) {
        h += `<label class="check mt"><input type="checkbox" id="fersatz" ${st.ersatz ? 'checked' : ''}><span>Ersatz-Programm gemacht (Wasser ist ausgefallen)</span></label>`;
      }
      const hl = hintList();
      if (hl.length) {
        h += `<div class="formsec"><h3>Vorgaben umgesetzt?</h3>${hl.map((t, i) => {
          const prev = prevHints.find((p) => p.text === t);
          return `<label class="check"><input type="checkbox" data-hint="${i}" ${prev && prev.done ? 'checked' : ''}><span>${esc(t)}</span></label>`;
        }).join('')}</div>`;
      }
      h += `<div class="formsec"><h3>${isKraft ? 'Kraft' : 'Ausdauer'}</h3>`;
      const minVal = log ? (log.minutes != null ? log.minutes : '') : (unit && unit.minutes ? unit.minutes : '');
      if (!isKraft) {
        h += `<div class="faint" style="margin:2px 0 8px">Bestandteile der Einheit – aus dem Plan vorausgefüllt. Anpassen, löschen oder ergänzen.</div>
          <div id="plist"></div>
          <button type="button" class="btn ghost small" id="addpart">+ Bestandteil hinzufügen</button>
          <div class="ptotal" id="ptotal"></div>`;
      } else {
        const ex = exList();
        h += `<label class="f">Minuten</label><input class="in" id="fmin" inputmode="numeric" value="${esc(minVal)}">`;
        h += `<label class="f">Gewichte (kg)</label><div id="wlist">`;
        ex.forEach((e, i) => {
          const prev = log && log.weights ? log.weights.find((w) => w.name === e.name) : null;
          const lw = lastWeight(ctx, e.name, log ? addDays(d, -1) : d);
          h += `<div class="wrow"><div class="nm">${esc(e.name)}<small>${esc(e.info)}${lw ? (e.info ? ' · ' : '') + 'zuletzt ' + fmtNum(lw.kg, 1) + ' kg' : ''}</small></div>
            <input class="in" data-w="${i}" data-wname="${esc(e.name)}" inputmode="decimal" placeholder="kg" value="${esc(prev && prev.kg != null ? prev.kg : '')}"></div>`;
        });
        h += `</div><button class="btn ghost small" id="addex">+ Übung hinzufügen</button>
          <div class="grid2"><div><label class="f">Ergo-Belastung</label><input class="in" id="fergo" placeholder="z. B. 3× 250 m" value="${esc(log ? log.ergo : '')}"></div>
          <div><label class="f">Split</label><input class="in" id="fsplit" placeholder="z. B. 1:45" value="${esc(log ? log.split : '')}"></div></div>`;
      }
      h += `</div>`;
      h += `<div class="formsec"><h3>Belastungsempfinden (RPE)</h3><div class="faint" style="margin-bottom:8px">1 = sehr leicht · 10 = maximal</div>
        <div class="rpe">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" data-rpe="${n}" class="${st.rpe === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
      const existingFiles = log ? (log.fileCount || (log.files || []).length || (log.screenshot ? 1 : 0)) : 0;
      h += `<div class="formsec"><h3>Screenshots / Fotos</h3>
        <div class="faint" style="margin:2px 0 8px">Beliebig viele – z. B. eins pro Bestandteil (Ergo, Rad, Lauf …). ${!isKraft ? 'Über das Kamera-Symbol am Bestandteil wird das Foto direkt zugeordnet.' : ''}</div>
        ${existingFiles ? `<div class="chip good" style="margin:0 0 8px">${existingFiles} bereits hochgeladen</div>` : ''}
        <label class="upload">${ICON.camera}<span>Foto hinzufügen</span><input type="file" id="ffile" accept="image/*" multiple></label>
        <div class="files" id="fprev"></div></div>`;
      h += `<div class="formsec"><h3>Kommentar</h3><textarea class="in" id="fcomment" placeholder="Wie lief's? Technik, Wetter, Gefühl …">${esc(log ? log.comment : '')}</textarea></div>`;
      body.innerHTML = h;

      // Events
      const fdt = $('#fdate');
      if (fdt && !isExtra) fdt.onchange = () => { snapshot(); draw(); };
      const fe = $('#fersatz');
      if (fe) fe.onchange = () => { snapshot(); st.ersatz = fe.checked; st.ersatzChanged = true; if (unit && st.type !== 'kraft') st.parts = partsFromUnit(unit, st.ersatz).map(clonePart); draw(); };
      const ft = $('#ftype');
      if (ft) ft.onchange = () => { snapshot(); st.type = ft.value; if (st.type !== 'kraft' && !st.parts.length) st.parts = [emptyPart()]; draw(); };
      $$('[data-rpe]', body).forEach((b) => b.onclick = () => { st.rpe = st.rpe === Number(b.dataset.rpe) ? null : Number(b.dataset.rpe); $$('[data-rpe]', body).forEach((x) => x.classList.toggle('on', Number(x.dataset.rpe) === st.rpe)); });
      $('#ffile').onchange = (e) => addFiles(e.target, '');
      renderFiles();
      if (!isKraft) {
        renderParts();
        $('#addpart').onclick = () => { st.parts.push(emptyPart()); renderParts(); const sels = $$('[data-pf="sport"]', body); if (sels.length) sels[sels.length - 1].focus(); };
      }
      const ax = $('#addex');
      if (ax) ax.onclick = () => {
        const name = prompt('Name der Übung');
        if (!name) return;
        const wl = $('#wlist');
        const i = $$('[data-w]', wl).length;
        wl.insertAdjacentHTML('beforeend', `<div class="wrow"><div class="nm">${esc(name)}</div><input class="in" data-w="${i}" data-wname="${esc(name)}" inputmode="decimal" placeholder="kg"></div>`);
      };
      restore();
    }
    async function addFiles(input, part) {
      const files = Array.from(input.files || []);
      input.value = '';
      for (const f of files) {
        try { const img = await compressImage(f); img.part = part || ''; st.files.push(img); } catch (err) { toast('Bild konnte nicht gelesen werden'); }
      }
      renderFiles();
      if (files.length) toast(files.length === 1 ? 'Foto hinzugefügt' : files.length + ' Fotos hinzugefügt');
    }
    function renderFiles() {
      const el = $('#fprev');
      if (!el) return;
      el.innerHTML = st.files.map((f, i) => `<div class="thumb"><img src="${f.data}" alt="">${f.part ? `<span class="tlbl">${esc(f.part)}</span>` : ''}<button type="button" data-fdel="${i}" aria-label="Foto entfernen">✕</button></div>`).join('')
        + (st.files.length ? `<div class="faint" style="align-self:center">${st.files.length} neu</div>` : '');
      $$('[data-fdel]', el).forEach((b) => b.onclick = () => { st.files.splice(Number(b.dataset.fdel), 1); renderFiles(); renderParts(); });
    }
    function partsTotal() {
      let min = 0, km = 0, hasMin = false, hasKm = false, hrW = 0, hrSum = 0;
      st.parts.forEach((p) => {
        const m = parseFloat(String(p.minutes).replace(',', '.')), k = parseFloat(String(p.km).replace(',', '.')), hr = parseFloat(p.hr);
        if (!isNaN(m)) { min += m; hasMin = true; }
        if (!isNaN(k)) { km += k; hasKm = true; }
        if (!isNaN(hr)) { const w = isNaN(m) || !m ? 1 : m; hrW += w; hrSum += hr * w; }
      });
      return { minutes: hasMin ? Math.round(min) : '', km: hasKm ? Math.round(km * 100) / 100 : '', hr: hrW ? Math.round(hrSum / hrW) : '' };
    }
    function updateTotal() {
      const t = partsTotal(), el = $('#ptotal');
      if (!el) return;
      const plan = unit && unit.minutes ? ' · geplant ' + unit.minutes + ' min' : '';
      el.innerHTML = `Gesamt: <b>${t.minutes !== '' ? t.minutes + ' min' : '–'}</b>${t.km !== '' ? ' · ' + fmtNum(t.km, 2) + ' km' : ''}${t.hr !== '' ? ' · HF Ø ' + t.hr : ''}<span class="faint">${plan}</span>`;
    }
    function renderParts() {
      const list = $('#plist');
      if (!list) return;
      list.innerHTML = st.parts.map((p, i) => {
        const opts = SPORTS.concat(p.sport && !SPORTS.includes(p.sport) ? [p.sport] : []);
        return `<div class="part" data-p="${i}">
          <div class="part-top"><select class="in" data-pf="sport" aria-label="Sportart"><option value="">Sportart wählen …</option>${opts.map((x) => `<option ${x === p.sport ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
          <label class="iconbtn pcam" aria-label="Foto zu diesem Bestandteil">${ICON.camera}<input type="file" accept="image/*" multiple data-pcam="${i}"></label>
          <button type="button" class="iconbtn" data-pdel="${i}" aria-label="Bestandteil entfernen">✕</button></div>
          ${(() => { const n = st.files.filter((f) => f.part && f.part === (p.sport || 'Bestandteil ' + (i + 1))).length; return n ? `<div class="pphoto">✓ ${n} Foto${n > 1 ? 's' : ''} zugeordnet</div>` : ''; })()}
          <div class="grid3"><label><span class="pl">Minuten</span><input class="in" data-pf="minutes" inputmode="numeric" value="${esc(p.minutes)}"></label>
          <label><span class="pl">km</span><input class="in" data-pf="km" inputmode="decimal" value="${esc(p.km)}"></label>
          <label><span class="pl">Puls Ø</span><input class="in" data-pf="hr" inputmode="numeric" value="${esc(p.hr)}"></label></div></div>`;
      }).join('') || '<div class="faint">Noch kein Bestandteil.</div>';
      $$('.part', list).forEach((row) => {
        const i = Number(row.dataset.p);
        $$('[data-pf]', row).forEach((el) => {
          const f = el.dataset.pf;
          const upd = () => { st.parts[i][f] = el.value; updateTotal(); };
          el.addEventListener('input', upd); el.addEventListener('change', upd);
        });
      });
      $$('[data-pdel]', list).forEach((b) => b.onclick = () => { st.parts.splice(Number(b.dataset.pdel), 1); renderParts(); });
      $$('[data-pcam]', list).forEach((inp) => inp.onchange = async () => { const i = Number(inp.dataset.pcam); const p = st.parts[i]; await addFiles(inp, p.sport || 'Bestandteil ' + (i + 1)); renderParts(); });
      updateTotal();
    }
    // Werte beim Neuzeichnen erhalten
    let snap = null;
    function snapDate() { const el = document.getElementById('fdate'); return el ? el.value : d; }
    function snapshot() {
      snap = {};
      $$('input.in, select.in, textarea.in', body).forEach((el) => { if (el.id) snap[el.id] = el.value; });
      snap._w = $$('[data-w]', body).map((el) => ({ name: el.dataset.wname, v: el.value }));
      snap._h = $$('[data-hint]', body).map((el) => el.checked);
    }
    function restore() {
      if (!snap) return;
      Object.entries(snap).forEach(([k, v]) => { if (k[0] !== '_') { const el = document.getElementById(k); if (el && el.type !== 'file') el.value = v; } });
      (snap._w || []).forEach((w) => { const el = $$('[data-w]', body).find((x) => x.dataset.wname === w.name); if (el) el.value = w.v; });
      snap = null;
    }

    draw();
    const close = () => { root.innerHTML = ''; document.body.style.overflow = ''; };
    document.body.style.overflow = 'hidden';
    $('#mclose').onclick = close;
    $('#mcancel').onclick = close;
    $('.modal-back').addEventListener('click', (e) => { if (e.target.classList.contains('modal-back')) close(); });
    const del = $('#mdel');
    if (del) del.onclick = async () => {
      if (!confirm('Diesen Eintrag wirklich löschen?')) return;
      del.disabled = true;
      try { await api('deleteLog', { id: log.id }); close(); toast('Eintrag gelöscht'); await reloadData(); }
      catch (e) { $('#merr').textContent = e.message; del.disabled = false; }
    };
    $('#msave').onclick = async () => {
      const btn = $('#msave');
      const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const hl = hintList();
      const hints = hl.map((t, i) => ({ text: t, done: !!($(`[data-hint="${i}"]`, body) || {}).checked }));
      const weights = $$('[data-w]', body).map((el) => ({ name: el.dataset.wname, kg: el.value.trim() })).filter((w) => w.kg !== '');
      const isK = st.type === 'kraft';
      const parts = isK ? [] : st.parts.filter((p) => p.sport || String(p.minutes).trim() || String(p.km).trim() || String(p.hr).trim())
        .map((p) => ({ sport: p.sport || 'Sonstiges', minutes: String(p.minutes).trim(), km: String(p.km).trim(), hr: String(p.hr).trim() }));
      const tot = partsTotal();
      const sportList = [...new Set(parts.map((p) => p.sport))];
      const payload = {
        id: log ? log.id : undefined,
        athlete: ctx.isCoach ? ctx.athlete.name : undefined,
        date: val('fdate') || d,
        planDate: unit ? unit.date : '',
        unitKey: unit ? unit.key : (log ? log.unitKey : 'extra|' + Date.now()),
        title: isExtra ? (val('ftitle') || 'Zusatzeinheit') : title,
        type: st.type,
        sport: isK ? 'Kraft' : sportList.join(' + '),
        ersatz: st.ersatz,
        planMinutes: unit ? unit.minutes : (log ? log.planMinutes : ''),
        minutes: isK ? val('fmin') : tot.minutes,
        km: isK ? '' : tot.km,
        hr: isK ? '' : tot.hr,
        parts,
        rpe: st.rpe,
        hints, weights,
        ergo: val('fergo'), split: val('fsplit'),
        comment: val('fcomment')
      };
      if (isExtra) payload.planMinutes = '';
      btn.disabled = true; btn.textContent = st.files.length ? (st.files.length > 1 ? 'Lädt ' + st.files.length + ' Bilder hoch …' : 'Lädt Bild hoch …') : 'Speichert …';
      try {
        await api('saveLog', { log: payload, files: st.files.map((f) => ({ data: f.data, mime: f.mime, part: f.part || '' })) });
        close();
        toast('Gespeichert');
        await reloadData();
      } catch (e) {
        $('#merr').textContent = e.message;
        btn.disabled = false; btn.textContent = 'Speichern';
      }
    };
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 1600;
          let { width: w, height: h } = img;
          if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve({ data: c.toDataURL('image/jpeg', 0.82), mime: 'image/jpeg' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ------------------------------------------------------------ Installation (PWA)
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone; }
  function installHint() {
    if (isStandalone() || store.get('hideInstall')) return '';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="card install mt2" id="inst"><div class="row between"><b>App auf den Homescreen</b><button class="btn ghost small" id="insthide">Ausblenden</button></div>
      <div class="faint">${ios ? 'In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.' : 'Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.'}</div>
      ${!ios ? '<button class="btn small mt" id="instbtn" hidden>Jetzt installieren</button>' : ''}</div>`;
  }
  function bindInstall() {
    const h = $('#insthide'); if (h) h.onclick = () => { store.set('hideInstall', true); $('#inst').remove(); };
    const b = $('#instbtn');
    if (b && deferredPrompt) { b.hidden = false; b.onclick = async () => { deferredPrompt.prompt(); deferredPrompt = null; b.hidden = true; }; }
  }

  // ------------------------------------------------------------ Start
  async function boot() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!S.auth) return showLogin();
    // Sofort aus dem Cache zeigen, dann aktualisieren
    const cached = store.get('cache_athlete'), cachedC = store.get('cache_coach');
    if (cachedC && cachedC.user && cachedC.user.name === S.auth.name) { S.user = cachedC.user; S.coach = cachedC; S.view = 'ctoday'; render(); }
    else if (cached && cached.user && cached.user.name === S.auth.name) { S.user = cached.user; S.data = cached; render(); }
    try {
      await loadAll(!!S.user);
      render();
    } catch (e) {
      if (/PIN|Name/.test(e.message)) { S.user = null; store.del('auth'); S.auth = null; return showLogin(e.message); }
      if (S.user) toast('Offline – zeige gespeicherte Daten'); else showLogin(e.message);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.user && Date.now() - (boot._last || 0) > 5 * 60 * 1000) { boot._last = Date.now(); reloadData(); }
  });
  boot._last = Date.now();
  boot();
})();
