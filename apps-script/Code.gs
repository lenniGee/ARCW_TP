/**
 * ARCW Trainingsplan – Backend (Google Apps Script, an das Google Sheet gebunden)
 *
 * Tabs, die das Script verwendet:
 *  - Plan-Blätter (Marie, Alex, Junioren A, Junioren B) und Kraft-Blätter: werden nur gelesen
 *  - "Zugang":           Sportler, Gruppe, Plan-Blatt, Kraft-Blatt, PIN, Rolle, Aktiv
 *  - "Protokoll":        eine Zeile pro protokollierter Einheit (wird von der App geschrieben)
 *  - "App-Einstellungen": Startdatum der Auswertung, Drive-Ordner für Screenshots
 *
 * Einmalig im Editor ausführen: setup()
 * Danach: Bereitstellen → Neue Bereitstellung → Web-App (Ausführen als: Ich, Zugriff: Jeder)
 */

var TAB_ACCESS = 'Zugang';
var TAB_LOG = 'Protokoll';
var TAB_SETTINGS = 'App-Einstellungen';

var LOG_HEADERS = [
  'ID', 'Zeitstempel', 'Sportler', 'Gruppe', 'Plan-Blatt', 'Datum', 'Einheit-Key', 'Einheit', 'Typ',
  'Sportart', 'Ersatz', 'Plan-Minuten', 'Minuten', 'km', 'Puls', 'RPE', 'Vorgaben', 'Vorgaben erfüllt',
  'Gewichte', 'Ergo-Belastung', 'Split', 'Kommentar', 'Screenshot', 'Screenshot-Links', 'Daten (JSON)', 'Plan-Datum', 'Bestandteile', 'Krank'
];

var ATHLETES = [
  ['Ida Tibitanzl', 'B'], ['Paul Reuther', 'B'], ['Paul Schumacher', 'B'], ['Elsa Oechsner', 'B'],
  ['Paula Strubel', 'B'], ['Paul Nachtigall', 'B'], ['Matthias Viering', 'B'], ['Maximilian Meyer', 'B'],
  ['Nathan Hoch', 'B'], ['Frederick Glaab', 'B'],
  ['Moritz Schwarzmann', 'A'], ['Jonas Küchler', 'A'], ['Felicitas Neumann', 'A'],
  ['Alex Rust', 'A', 'Alex', ''], ['Marie Schütze', 'A', 'Marie', ''], ['Rosa Stohr', 'A']
];

/* ------------------------------------------------------------------ Setup */

function setup() {
  var ss = SpreadsheetApp.getActive();

  // Zugang
  var acc = ss.getSheetByName(TAB_ACCESS);
  if (!acc) {
    acc = ss.insertSheet(TAB_ACCESS);
    acc.getRange(1, 1, 1, 7).setValues([['Name', 'Gruppe', 'Plan-Blatt', 'Kraft-Blatt', 'PIN', 'Rolle', 'Aktiv']])
      .setFontWeight('bold').setBackground('#1a7f24').setFontColor('#ffffff');
    var used = {};
    var rows = ATHLETES.map(function (a) {
      var plan = a[2] || (a[1] === 'A' ? 'Junioren A' : 'Junioren B');
      var kraft = a.length > 3 ? a[3] : (a[1] === 'A' ? 'Kraft A-Junioren' : 'Kraft B-Junioren');
      return [a[0], a[1], plan, kraft, newPin_(used), 'Sportler', 'Ja'];
    });
    rows.push(['Trainer', '', '', '', newPin_(used), 'Trainer', 'Ja']);
    acc.getRange(2, 5, rows.length, 1).setNumberFormat('@');
    acc.getRange(2, 1, rows.length, 7).setValues(rows);
    acc.setFrozenRows(1);
    acc.autoResizeColumns(1, 7);
    acc.getRange(rows.length + 3, 1).setValue(
      'PIN vergessen? Einfach hier eine neue 4-stellige PIN eintragen. Rolle "Trainer" sieht alle Sportler. ' +
      'Neue Sportler: Zeile hinzufügen (Plan-Blatt = Name des Tabs mit dem Plan, Kraft-Blatt optional).');
  }

  // Protokoll
  var log = ss.getSheetByName(TAB_LOG);
  if (!log) {
    log = ss.insertSheet(TAB_LOG);
    log.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setBackground('#1a7f24').setFontColor('#ffffff');
    log.setFrozenRows(1);
    log.getRange('F:F').setNumberFormat('@');
    log.hideColumns(25); // JSON-Spalte
    log.getRange('Z:Z').setNumberFormat('@');
  }

  // Einstellungen
  var st = ss.getSheetByName(TAB_SETTINGS);
  if (!st) {
    st = ss.insertSheet(TAB_SETTINGS);
    var folder = DriveApp.createFolder('ARCW Trainingsprotokoll – Screenshots');
    st.getRange(1, 1, 4, 2).setValues([
      ['Einstellung', 'Wert'],
      ['Startdatum Auswertung', '2026-11-18'],
      ['Drive-Ordner-ID Screenshots', folder.getId()],
      ['Drive-Ordner-Link', folder.getUrl()]
    ]);
    st.getRange('B2').setNumberFormat('@');
    st.getRange(1, 1, 1, 2).setFontWeight('bold');
    st.autoResizeColumns(1, 2);
  }
  return 'Setup fertig';
}

function newPin_(used) {
  var pin;
  do {
    pin = String(1000 + Math.floor(Math.random() * 9000));
  } while (used[pin] || /^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321');
  used[pin] = true;
  return pin;
}

/* ------------------------------------------------------------------ Web-API */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return handle_(p);
  return json_({ ok: true, app: 'ARCW Trainingsplan API' });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'Ungültige Anfrage' }); }
  return handle_(body);
}

function handle_(req) {
  try {
    var action = req.action;
    if (action === 'names') return json_({ ok: true, names: listNames_() });
    var user = auth_(req.name, req.pin);
    var res;
    switch (action) {
      case 'login': res = { user: publicUser_(user) }; break;
      case 'athlete': res = athleteData_(user, req.athlete); break;
      case 'coach': res = coachData_(user); break;
      case 'hall': res = { hall: hallOfFame_() }; break;
      case 'saveLog': res = saveLog_(user, req.log, req.files || []); break;
      case 'deleteLog': res = deleteLog_(user, req.id); break;
      default: throw new Error('Unbekannte Aktion');
    }
    res.ok = true;
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ Zugang */

function readAccess_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB_ACCESS);
  if (!sh) throw new Error('Tab "Zugang" fehlt – bitte setup() ausführen');
  var v = sh.getDataRange().getDisplayValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!r[0] || !r[4]) continue;
    if (String(r[6]).trim().toLowerCase() === 'nein') continue;
    out.push({
      name: r[0].trim(), group: r[1].trim(), plan: r[2].trim(), kraft: r[3].trim(),
      pin: String(r[4]).trim(), role: (r[5] || 'Sportler').trim().toLowerCase() === 'trainer' ? 'coach' : 'athlete'
    });
  }
  return out;
}

function listNames_() {
  return readAccess_().map(function (u) { return { name: u.name, group: u.group, role: u.role }; });
}

function auth_(name, pin) {
  if (!name || !pin) throw new Error('Bitte Name und PIN eingeben');
  var cache = CacheService.getScriptCache();
  var key = 'fail_' + Utilities.base64EncodeWebSafe(String(name)).slice(0, 200);
  var fails = Number(cache.get(key) || 0);
  if (fails >= 8) throw new Error('Zu viele Fehlversuche – bitte 15 Minuten warten oder Trainer fragen');
  var user = readAccess_().filter(function (u) { return u.name === name; })[0];
  if (!user || user.pin !== String(pin).trim()) {
    cache.put(key, String(fails + 1), 900);
    throw new Error('Name oder PIN falsch');
  }
  return user;
}

function publicUser_(u) {
  return { name: u.name, group: u.group, role: u.role, plan: u.plan, kraft: u.kraft };
}

/* ------------------------------------------------------------------ Daten lesen */

function settings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB_SETTINGS);
  var s = { startDate: '2026-11-18', folderId: '' };
  if (!sh) return s;
  sh.getDataRange().getDisplayValues().forEach(function (r) {
    if (/^startdatum/i.test(r[0])) s.startDate = normDate_(r[1]) || s.startDate;
    if (/ordner-id/i.test(r[0])) s.folderId = String(r[1]).trim();
  });
  return s;
}

function normDate_(s) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function dateFmt_() {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
}

var planCache_ = {};
function readPlan_(sheetName) {
  if (planCache_[sheetName]) return planCache_[sheetName];
  var sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return { sheet: sheetName, units: [], weeks: [], error: 'Blatt "' + sheetName + '" nicht gefunden' };
  var res = PARSER.parsePlan(sheetName, sh.getDataRange().getValues(), dateFmt_());
  planCache_[sheetName] = res;
  return res;
}

var kraftCache_ = {};
function readKraft_(sheetName) {
  if (!sheetName) return null;
  if (kraftCache_[sheetName]) return kraftCache_[sheetName];
  var sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return null;
  var range = sh.getDataRange();
  var values = range.getValues();
  var links = [];
  try {
    links = range.getRichTextValues().map(function (row) {
      return row.map(function (rt) { return rt && rt.getLinkUrl() ? rt.getLinkUrl() : ''; });
    });
  } catch (e) { links = []; }
  var res = PARSER.parseKraft(sheetName, values, links);
  kraftCache_[sheetName] = res;
  return res;
}

function logSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB_LOG);
  if (!sh) throw new Error('Tab "Protokoll" fehlt – bitte setup() ausführen');
  return sh;
}

function readLogs_(filterName) {
  var sh = logSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, Math.min(LOG_HEADERS.length, sh.getMaxColumns())).getValues();
  var out = [];
  v.forEach(function (r, i) {
    if (!r[0]) return;
    if (filterName && r[2] !== filterName) return;
    var data = {};
    try { data = JSON.parse(r[24] || '{}'); } catch (e) { data = {}; }
    out.push({
      id: String(r[0]),
      row: i + 2,
      ts: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
      athlete: r[2], group: r[3], sheet: r[4],
      date: r[5] instanceof Date ? dateFmt_()(r[5]) : String(r[5]),
      unitKey: r[6], title: r[7], type: r[8], sport: r[9], ersatz: r[10] === 'Ja',
      planMinutes: num_(r[11]), minutes: num_(r[12]), km: num_(r[13]), hr: num_(r[14]), rpe: num_(r[15]),
      hints: data.hints || [], weights: data.weights || [],
      ergo: r[19], split: r[20], comment: r[21],
      screenshot: r[22] === 'Ja',
      files: data.files || [],
      fileCount: (data.files || []).length,
      planDate: r[25] instanceof Date ? dateFmt_()(r[25]) : String(r[25] || ''),
      parts: data.parts || [],
      sick: !!data.sick || r[27] === 'Ja'
    });
  });
  return out;
}

function num_(v) {
  if (v === '' || v == null) return null;
  var n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/* ------------------------------------------------------------------ Endpunkte */

function resolveAthlete_(user, athleteName) {
  if (user.role === 'coach' && athleteName) {
    var a = readAccess_().filter(function (u) { return u.name === athleteName; })[0];
    if (!a) throw new Error('Sportler nicht gefunden');
    return a;
  }
  if (user.role === 'coach') throw new Error('Bitte Sportler wählen');
  return user;
}

function athleteData_(user, athleteName) {
  var a = resolveAthlete_(user, athleteName);
  var plan = readPlan_(a.plan);
  var kraft = readKraft_(a.kraft);
  var logs = readLogs_(a.name);
  var isCoach = user.role === 'coach';
  if (!isCoach) logs.forEach(function (l) { l.files = l.files.map(function (f) { return { name: f.name }; }); });
  return {
    user: publicUser_(user),
    athlete: publicUser_(a),
    settings: { startDate: settings_().startDate },
    plan: plan,
    kraft: kraft,
    logs: logs
  };
}

function coachData_(user) {
  if (user.role !== 'coach') throw new Error('Nur für Trainer');
  var access = readAccess_().filter(function (u) { return u.role === 'athlete'; });
  var plans = {}, kraft = {};
  access.forEach(function (a) {
    if (!plans[a.plan]) plans[a.plan] = readPlan_(a.plan);
    if (a.kraft && !kraft[a.kraft]) kraft[a.kraft] = readKraft_(a.kraft);
  });
  return {
    user: publicUser_(user),
    settings: settings_(),
    athletes: access.map(publicUser_),
    plans: plans,
    kraft: kraft,
    logs: readLogs_(null)
  };
}

function hallOfFame_() {
  var s = settings_();
  var access = readAccess_().filter(function (u) { return u.role === 'athlete'; });
  var logs = readLogs_(null);
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var now = new Date();
  var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1 = Montag
  var monday = Utilities.formatDate(new Date(now.getTime() - (dow - 1) * 86400000), tz, 'yyyy-MM-dd');
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var map = {};
  access.forEach(function (a) { map[a.name] = { name: a.name, group: a.group, minutes: 0, week: 0, sessions: 0, weekSessions: 0 }; });
  logs.forEach(function (l) {
    var m = map[l.athlete];
    if (!m || l.date < s.startDate || l.date > today) return;
    var min = l.minutes != null ? l.minutes : (l.planMinutes || 0);
    m.minutes += min;
    m.sessions += 1;
    if (l.date >= monday) { m.week += min; m.weekSessions += 1; }
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

/* ------------------------------------------------------------------ Protokoll schreiben */

function saveLog_(user, log, files) {
  if (!log || !log.date) throw new Error('Datum fehlt');
  var athlete = user.role === 'coach' && log.athlete ? resolveAthlete_(user, log.athlete) : user;
  if (athlete.role === 'coach') throw new Error('Bitte Sportler wählen');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = logSheet_();
    var existing = null;
    if (log.id) {
      existing = readLogs_(athlete.name).filter(function (l) { return l.id === String(log.id); })[0];
      if (!existing) throw new Error('Eintrag nicht gefunden');
    }
    // Sportler: nur bis zu BACKDAYS Tage rückwirkend eintragen/ändern (Trainer ausgenommen)
    if (user.role !== 'coach') {
      var minDate = minLogDate_();
      if (String(log.date) < minDate) throw new Error('Einheiten können nur bis zu ' + BACKDAYS + ' Tage rückwirkend eingetragen werden.');
      if (existing && existing.date < minDate) throw new Error('Dieser Eintrag ist älter als ' + BACKDAYS + ' Tage und kann nicht mehr geändert werden.');
      if (String(log.date) > Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd')) throw new Error('Das Datum liegt in der Zukunft.');
    }

    // Screenshots speichern
    var stored = existing ? existing.files.slice() : [];
    if (files && files.length) {
      var folder = athleteFolder_(athlete.name);
      files.forEach(function (f, i) {
        var bytes = Utilities.base64Decode(String(f.data).replace(/^data:[^,]+,/, ''));
        var ext = /png/.test(f.mime) ? 'png' : 'jpg';
        var part = String(f.part || '').slice(0, 30);
        var fname = log.date + '_' + athlete.name.replace(/\s+/g, '_') + '_' +
          String(log.title || 'Einheit').replace(/[^\wäöüÄÖÜß\-]+/g, '_').slice(0, 40) +
          (part ? '_' + part.replace(/[^\wäöüÄÖÜß\-]+/g, '_') : '') + '_' + (stored.length + 1) + '.' + ext;
        var file = folder.createFile(Utilities.newBlob(bytes, f.mime || 'image/jpeg', fname));
        stored.push({ id: file.getId(), url: file.getUrl(), name: fname, part: part });
      });
    }

    // Krank: 0 Minuten, keine Trainingsdaten
    if (log.sick) { log.minutes = 0; log.km = ''; log.hr = ''; log.rpe = ''; log.parts = []; log.hints = []; log.weights = []; log.sport = 'Krank'; }
    var hints = (log.hints || []).map(function (h) { return { text: String(h.text), done: !!h.done }; });
    var parts = (log.parts || []).filter(function (p) { return p && (p.sport || p.minutes !== '' || p.km !== '' || p.hr !== ''); }).map(function (p) {
      return { sport: String(p.sport || 'Sonstiges'), minutes: num_(p.minutes), km: num_(p.km), hr: num_(p.hr) };
    });
    var weights = (log.weights || []).filter(function (w) { return w && w.name; }).map(function (w) {
      return { name: String(w.name), kg: w.kg === '' || w.kg == null ? null : Number(String(w.kg).replace(',', '.')), note: w.note || '' };
    });
    var id = existing ? existing.id : Utilities.getUuid().slice(0, 8);
    // Zeitstempel immer in Berliner Zeit, als Text (unabhängig von der Zeitzone der Tabelle)
    var ts = Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm:ss');
    var row = [
      id,
      ts,
      athlete.name,
      athlete.group,
      athlete.plan,
      log.date,
      log.unitKey || '',
      log.title || '',
      log.type || '',
      log.sport || '',
      log.ersatz ? 'Ja' : 'Nein',
      blank_(log.planMinutes),
      blank_(log.minutes),
      blank_(log.km),
      blank_(log.hr),
      blank_(log.rpe),
      hints.map(function (h) { return (h.done ? '✔ ' : '✘ ') + h.text; }).join('\n'),
      hints.length ? hints.filter(function (h) { return h.done; }).length + '/' + hints.length : '',
      weights.filter(function (w) { return w.kg != null; }).map(function (w) { return w.name + ': ' + w.kg + ' kg' + (w.note ? ' (' + w.note + ')' : ''); }).join('\n'),
      log.ergo || '',
      log.split || '',
      log.comment || '',
      stored.length ? 'Ja' : 'Nein',
      stored.map(function (f) { return f.url; }).join('\n'),
      JSON.stringify({ hints: hints, weights: weights, files: stored, parts: parts, sick: !!log.sick }),
      log.planDate || '',
      parts.map(function (p) {
        return p.sport + (p.minutes != null ? ' ' + p.minutes + ' min' : '') + (p.km != null ? ' / ' + p.km + ' km' : '') + (p.hr != null ? ' / HF ' + p.hr : '');
      }).join('\n'),
      log.sick ? 'Ja' : ''
    ];
    ensureLogHeader_(sh);
    if (existing) {
      sh.getRange(existing.row, 2).setNumberFormat('@');
      sh.getRange(existing.row, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
      var lr = sh.getLastRow();
      sh.getRange(lr, 2).setNumberFormat('@').setValue(ts);
      sh.getRange(lr, 6).setNumberFormat('@').setValue(log.date);
      sh.getRange(lr, 26).setNumberFormat('@').setValue(log.planDate || '');
    }
    return { id: id, files: stored.length };
  } finally {
    lock.releaseLock();
  }
}

/** Ältere Protokoll-Tabs um neue Spalten ergänzen. */
function ensureLogHeader_(sh) {
  if (sh.getMaxColumns() < LOG_HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), LOG_HEADERS.length - sh.getMaxColumns());
  var h = sh.getRange(1, 1, 1, LOG_HEADERS.length).getValues()[0];
  for (var i = 25; i < LOG_HEADERS.length; i++) {
    if (h[i] !== LOG_HEADERS[i]) {
      sh.getRange(1, i + 1).setValue(LOG_HEADERS[i]).setFontWeight('bold').setBackground('#1a7f24').setFontColor('#ffffff');
    }
  }
}

var BACKDAYS = 3;
function minLogDate_() {
  return Utilities.formatDate(new Date(Date.now() - BACKDAYS * 86400000), 'Europe/Berlin', 'yyyy-MM-dd');
}

function deleteLog_(user, id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var logs = readLogs_(user.role === 'coach' ? null : user.name);
    var l = logs.filter(function (x) { return x.id === String(id); })[0];
    if (!l) throw new Error('Eintrag nicht gefunden');
    if (user.role !== 'coach' && l.date < minLogDate_()) throw new Error('Dieser Eintrag ist älter als ' + BACKDAYS + ' Tage und kann nicht mehr gelöscht werden.');
    logSheet_().deleteRow(l.row);
    return { deleted: id };
  } finally {
    lock.releaseLock();
  }
}

function blank_(v) {
  if (v === '' || v == null) return '';
  var n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? '' : n;
}

function athleteFolder_(name) {
  var s = settings_();
  var root;
  try { root = DriveApp.getFolderById(s.folderId); } catch (e) { root = null; }
  if (!root) throw new Error('Drive-Ordner nicht gefunden – siehe Tab "App-Einstellungen"');
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/* ------------------------------------------------------------------ Test im Editor */

function testParse() {
  var p = readPlan_('Junioren A');
  Logger.log(p.units.length + ' Einheiten, ' + p.weeks.length + ' Wochen');
  var k = readKraft_('Kraft A-Junioren');
  Logger.log(JSON.stringify(k.order));
}
