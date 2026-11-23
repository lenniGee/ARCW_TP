/**
 * Concept2-Logbook-Anbindung (freiwillig für Sportler).
 *
 * Einrichtung (einmalig, Trainer):
 *  1. Unter https://log.concept2.com/developers/keys eine Application anlegen.
 *     Redirect-URI: die App-Adresse, z. B. https://lennigee.github.io/ARCW_TP/
 *  2. Im Apps-Script unter Projekteinstellungen → Skripteigenschaften eintragen:
 *     C2_CLIENT_ID, C2_CLIENT_SECRET, C2_REDIRECT_URI (exakt wie bei Concept2 registriert)
 *
 * Ablauf: Sportler tippt "Concept2 verbinden" → Concept2-Login → Rücksprung in die App
 * mit ?code=… → App ruft Aktion c2Connect auf → Token wird pro Sportler gespeichert
 * (Skripteigenschaften, nicht im Sheet). Zugriff nur lesend (user:read,results:read).
 */
var C2_BASE = 'https://log.concept2.com';
var C2_SCOPE = 'user:read,results:read';
var TAB_C2 = 'Concept2';

function c2Conf_() {
  var p = PropertiesService.getScriptProperties();
  return { id: p.getProperty('C2_CLIENT_ID') || '', secret: p.getProperty('C2_CLIENT_SECRET') || '', redirect: p.getProperty('C2_REDIRECT_URI') || '' };
}
function c2Key_(name) { return 'c2tok_' + String(name).replace(/[^A-Za-z0-9äöüÄÖÜß]/g, '_'); }
function c2GetTok_(name) { var v = PropertiesService.getScriptProperties().getProperty(c2Key_(name)); return v ? JSON.parse(v) : null; }
function c2SetTok_(name, t) { PropertiesService.getScriptProperties().setProperty(c2Key_(name), JSON.stringify(t)); }

function c2AuthUrl_() {
  var c = c2Conf_();
  if (!c.id || !c.redirect) return '';
  return C2_BASE + '/oauth/authorize?client_id=' + encodeURIComponent(c.id) + '&scope=' + encodeURIComponent(C2_SCOPE) +
    '&response_type=code&redirect_uri=' + encodeURIComponent(c.redirect);
}

function c2Token_(params) {
  var c = c2Conf_();
  if (!c.id || !c.secret) throw new Error('Concept2 ist noch nicht eingerichtet (Trainer).');
  params.client_id = c.id; params.client_secret = c.secret; params.scope = C2_SCOPE;
  var res = UrlFetchApp.fetch(C2_BASE + '/oauth/access_token', { method: 'post', payload: params, muteHttpExceptions: true });
  var code = res.getResponseCode(), body = res.getContentText();
  if (code !== 200) throw new Error('Concept2-Anmeldung fehlgeschlagen (' + code + ')');
  var j = JSON.parse(body);
  return { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (Number(j.expires_in || 604800) - 300) * 1000 };
}

// Gültiges Zugriffstoken für einen Sportler (erneuert bei Bedarf)
function c2Access_(name) {
  var t = c2GetTok_(name);
  if (!t) throw new Error('Concept2 ist für ' + name + ' nicht verbunden.');
  if (Date.now() > t.exp) {
    var n = c2Token_({ grant_type: 'refresh_token', refresh_token: t.refresh });
    n.c2user = t.c2user; n.since = t.since;
    c2SetTok_(name, n); t = n;
  }
  return t.access;
}

function c2Get_(name, path) {
  var res = UrlFetchApp.fetch(C2_BASE + path, {
    headers: { Authorization: 'Bearer ' + c2Access_(name), Accept: 'application/vnd.c2logbook.v1+json' },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401) throw new Error('Concept2-Verbindung abgelaufen – bitte neu verbinden.');
  if (code !== 200) throw new Error('Concept2 antwortet nicht (' + code + ')');
  return JSON.parse(res.getContentText());
}

// ---------------------------------------------------------------- Aktionen für die App
function c2Status_(user, athleteName) {
  var a = resolveAthlete_(user, athleteName);
  var t = c2GetTok_(a.name);
  return { c2: { configured: !!c2AuthUrl_(), connected: !!t, c2user: t ? t.c2user || '' : '', since: t ? t.since || '' : '', authUrl: c2AuthUrl_() } };
}

function c2Connect_(user, code) {
  if (!code) throw new Error('Kein Code von Concept2 erhalten.');
  var t = c2Token_({ grant_type: 'authorization_code', code: code, redirect_uri: c2Conf_().redirect });
  t.since = Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy');
  c2SetTok_(user.name, t);
  try {
    var me = c2Get_(user.name, '/api/users/me');
    var d = me && me.data ? me.data : {};
    t.c2user = [d.first_name, d.last_name].filter(String).join(' ') || d.username || '';
    c2SetTok_(user.name, t);
  } catch (e) { /* Name ist optional */ }
  return c2Status_(user, user.name);
}

function c2Disconnect_(user) {
  PropertiesService.getScriptProperties().deleteProperty(c2Key_(user.name));
  return c2Status_(user, user.name);
}

// Workouts eines Tages (für das Protokoll-Formular), inkl. Intervallen und verdichtetem Verlauf
function c2Results_(user, athleteName, date) {
  var a = resolveAthlete_(user, athleteName);
  var d = normDate_(date);
  if (!d) throw new Error('Datum fehlt');
  var list = c2Get_(a.name, '/api/users/me/results?from=' + d + '&to=' + encodeURIComponent(d + ' 23:59:59') + '&number=50');
  var out = [];
  ((list && list.data) || []).forEach(function (r) { out.push(c2Compact_(a.name, r.id, true)); });
  return { workouts: out.filter(function (x) { return x; }) };
}

// Kompaktes Workout-Objekt: Kennzahlen, Intervalle, 60-Punkte-Verlauf (Split + Puls)
function c2Compact_(name, id, withCurve) {
  var j = c2Get_(name, '/api/users/me/results/' + id);
  if (!j || !j.data) return null;
  var r = j.data;
  var time = Number(r.time || 0) / 10, dist = Number(r.distance || 0);
  var split = dist ? time * 500 / dist : null;
  var o = {
    id: r.id, date: r.date, type: r.type, wt: r.workout_type || '', dist: dist, time: Math.round(time * 10) / 10,
    split: split ? Math.round(split * 10) / 10 : null, watt: split && r.type !== 'bike' ? Math.round(2.8 / Math.pow(split / 500, 3)) : null,
    spm: r.stroke_rate || null, hr: r.heart_rate && r.heart_rate.average ? r.heart_rate.average : null, iv: []
  };
  var w = r.workout || {};
  (w.intervals || w.splits || []).forEach(function (s) {
    o.iv.push([Math.round(Number(s.time || 0)) / 10, Number(s.distance || 0), s.stroke_rate || null, s.heart_rate && (s.heart_rate.average || s.heart_rate.ending) || null, s.rest_time ? Number(s.rest_time) / 10 : 0]);
  });
  o.isInterval = !!w.intervals;
  if (withCurve) {
    var st = c2Strokes_(name, r.id);
    if (st) { o.pc = st.pc; o.hc = st.hc; }
  }
  return o;
}

// Schlagdaten (Zeit/Distanz pro Intervall neu ab 0) → durchgehende Zeitachse, verdichtet
function c2Strokes_(name, id, raw) {
  var j = c2Get_(name, '/api/users/me/results/' + id + '/strokes');
  if (!j || !j.data || !j.data.length) return null;
  var pts = [], off = 0, last = 0;
  j.data.forEach(function (s) {
    var t = Number(s.t || 0) / 10;
    if (t + 0.001 < last) off += last; // neues Intervall
    last = t;
    pts.push({ t: off + t, p: Number(s.p || 0) / 10, hr: Number(s.hr || 0), spm: Number(s.spm || 0) });
  });
  if (raw) return pts;
  var B = 60, tot = pts[pts.length - 1].t || 1, pc = [], hc = [];
  for (var b = 0; b < B; b++) {
    var t0 = tot * b / B, t1 = tot * (b + 1) / B, sp = 0, np = 0, sh = 0, nh = 0;
    pts.forEach(function (q) { if (q.t >= t0 && q.t < t1) { if (q.p > 60 && q.p < 400) { sp += q.p; np++; } if (q.hr > 40) { sh += q.hr; nh++; } } });
    pc.push(np ? Math.round(sp / np * 10) / 10 : 0); hc.push(nh ? Math.round(sh / nh) : 0);
  }
  return { pc: pc, hc: hc };
}

// ---------------------------------------------------------------- Wochenauswertung (Trainer, im Editor ausführen)
/**
 * Holt für alle verbundenen Sportler die Workouts im Zeitraum und schreibt sie ins Blatt "Concept2":
 * Kennzahlen, Intervalle und Sekunden je Zone (nach Split/Watt und nach Puls, Zonen aus Blatt "Zonen").
 */
function c2Woche_(from, to) {
  var zones = c2ZonesFromSheet_();
  var rows = [];
  readAccess_().forEach(function (a) {
    if (!c2GetTok_(a.name)) return;
    var list = c2Get_(a.name, '/api/users/me/results?from=' + from + '&to=' + encodeURIComponent(to + ' 23:59:59') + '&number=250');
    ((list && list.data) || []).forEach(function (r) {
      var o = c2Compact_(a.name, r.id, false);
      if (!o) return;
      var pts = c2Strokes_(a.name, r.id, true) || [];
      var z = zones[a.name], zs = [0, 0, 0, 0, 0, 0], zh = [0, 0, 0, 0, 0, 0];
      for (var i = 1; i < pts.length; i++) {
        var dt = Math.min(10, Math.max(0, pts[i].t - pts[i - 1].t));
        if (z && o.type === 'rower' && pts[i].p > 60) { var k = z.sp.findIndex(function (b) { return pts[i].p > b; }); zs[k < 0 ? 5 : k] += dt; }
        if (z && pts[i].hr > 40) { var h = z.hr.findIndex(function (b) { return pts[i].hr < b; }); zh[h < 0 ? 5 : h] += dt; }
      }
      rows.push([String(o.id), a.name, String(o.date).slice(0, 10), String(o.date).slice(11, 16), o.type, o.wt, o.dist, Math.round(o.time / 6) / 10,
        o.split ? c2Fmt_(o.split) : '', o.watt || '', o.spm || '', o.hr || '',
        o.iv.map(function (s) { return c2Fmt_(s[0]) + ' / ' + s[1] + ' m' + (s[2] ? ' / SF ' + s[2] : ''); }).join('\n'),
        pts.length ? 'Ja' : 'Nein'].concat(zs.map(Math.round), zh.map(Math.round)));
    });
  });
  var head = ['Ergebnis-ID', 'Athlet', 'Datum', 'Uhrzeit', 'Gerät', 'Workout-Typ', 'Meter', 'Minuten', 'Ø Split', 'Ø Watt', 'Ø SF', 'Ø HF', 'Intervalle', 'Schlagdaten',
    'Split Z1 (s)', 'Split Z2 (s)', 'Split Z3 (s)', 'Split Z4 (s)', 'Split Z5 (s)', 'Split Z6 (s)', 'HF Z1 (s)', 'HF Z2 (s)', 'HF Z3 (s)', 'HF Z4 (s)', 'HF Z5 (s)', 'HF Z6 (s)'];
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB_C2) || SpreadsheetApp.getActive().insertSheet(TAB_C2);
  // vorhandene Zeilen behalten, gleiche IDs ersetzen
  var old = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues() : [];
  var ids = {}; rows.forEach(function (r) { ids[r[0]] = true; });
  var all = old.filter(function (r) { return r[0] && !ids[String(r[0])]; }).concat(rows);
  all.sort(function (x, y) { return String(x[2] + x[3]).localeCompare(String(y[2] + y[3])); });
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (all.length) { sh.getRange(2, 1, all.length, head.length).setNumberFormat('@'); sh.getRange(2, 1, all.length, head.length).setValues(all); }
  return { workouts: rows.length, total: all.length };
}
function c2Fmt_(s) { var m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1).replace('.', ','); }
function c2Sec_(t) { var m = String(t || '').match(/(\d+):(\d\d),?(\d)?/); return m ? Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0) : null; }
function c2ZonesFromSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Zonen'); var out = {};
  if (!sh) return out;
  var v = sh.getDataRange().getDisplayValues(), h = v[0];
  var ci = function (n) { return h.indexOf(n); };
  v.slice(1).forEach(function (r) {
    var name = r[ci('Athlet')], z = Number(String(r[ci('Zone')]).replace('Z', ''));
    if (!name || !z || z > 5) return;
    out[name] = out[name] || { sp: [], hr: [] };
    out[name].sp[z - 1] = c2Sec_(r[ci('Split /500 m schnell')]);
    var hr = String(r[ci('HF (bpm)')]).match(/(\d+)\s*$/); out[name].hr[z - 1] = hr ? Number(hr[1]) : 999;
  });
  return out;
}
/** Im Editor ausführen: letzte Woche (Mo–So) importieren */
function concept2VorwocheImportieren() {
  var now = new Date(), tz = 'Europe/Berlin';
  var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1 = Mo
  var mon = new Date(now.getTime() - (dow - 1 + 7) * 86400000), sun = new Date(mon.getTime() + 6 * 86400000);
  var res = c2Woche_(Utilities.formatDate(mon, tz, 'yyyy-MM-dd'), Utilities.formatDate(sun, tz, 'yyyy-MM-dd'));
  Logger.log(JSON.stringify(res));
  return res;
}
