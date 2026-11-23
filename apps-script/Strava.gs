/**
 * Strava-Import: eine Zeile pro Strava-Aktivität im Blatt "Strava".
 * Die Daten werden wöchentlich über den Browser (Strava-Webseite) gesammelt
 * und per stravaUpsert_(rows) eingetragen. Schlüssel ist die Aktivitäts-ID:
 * vorhandene Zeilen werden aktualisiert, neue angehängt.
 * Die Spalten "Zuordnung" und "Notiz" werden nie überschrieben (manuelle Pflege).
 */
var TAB_STRAVA = 'Strava';
var STRAVA_HEADERS = [
  'Aktivitäts-ID', 'Athlet', 'Datum', 'Start', 'Strava-Typ', 'Sportart (Vorschlag)', 'Titel', 'Beschreibung',
  'Gesamtzeit (min)', 'Bewegungszeit (min)', 'Distanz (km)', 'Tempo Ø', 'Ø HF', 'Max HF', 'Ø SF/Kadenz', 'Ø Watt',
  'Kalorien', 'Sätze', 'Volumen (kg)', 'Gerät', 'Gemeinsam mit', 'Fotos', 'Link', 'Strava-Athlet-ID', 'Importiert am',
  'Zuordnung', 'Notiz'
];
var STRAVA_MANUAL = 2; // letzte zwei Spalten: Zuordnung, Notiz

function stravaSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TAB_STRAVA);
  if (!sh) sh = ss.insertSheet(TAB_STRAVA);
  var first = sh.getRange(1, 1, 1, STRAVA_HEADERS.length).getValues()[0];
  if (first.join('|') !== STRAVA_HEADERS.join('|')) {
    sh.getRange(1, 1, 1, STRAVA_HEADERS.length).setValues([STRAVA_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(2);
  }
  return sh;
}

/**
 * rows: Array von Objekten {id, athlete, athleteId, date:'dd.MM.yyyy', time:'HH:mm', type, sport, title, desc,
 * elapsed, moving, km, pace, hrAvg, hrMax, cad, watt, kcal, sets, volume, device, group, photos}
 */
function stravaUpsert_(rows) {
  var sh = stravaSheet_();
  var tz = 'Europe/Berlin';
  var n = STRAVA_HEADERS.length, auto = n - STRAVA_MANUAL;
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('X:X').setNumberFormat('@');
  var last = sh.getLastRow();
  var existing = {};
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { existing[String(r[0])] = i + 2; });
  }
  var now = Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy HH:mm');
  var ins = 0, upd = 0, append = [];
  rows.forEach(function (o) {
    var d = Utilities.parseDate(o.date + ' 12:00', tz, 'dd.MM.yyyy HH:mm');
    var line = [
      String(o.id), o.athlete, d, o.time, o.type, o.sport, o.title, o.desc,
      o.elapsed, o.moving, o.km, o.pace, o.hrAvg, o.hrMax, o.cad, o.watt,
      o.kcal, o.sets, o.volume, o.device, o.group, o.photos,
      'https://www.strava.com/activities/' + o.id, String(o.athleteId), now
    ];
    var row = existing[String(o.id)];
    if (row) { sh.getRange(row, 1, 1, auto).setValues([line]); upd++; }
    else { append.push(line.concat(['', ''])); ins++; }
  });
  if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, n).setValues(append);
  last = sh.getLastRow();
  if (last > 2) sh.getRange(2, 1, last - 1, n).sort([{ column: 3, ascending: true }, { column: 2, ascending: true }, { column: 4, ascending: true }]);
  if (last > 1) sh.getRange(2, 3, last - 1, 1).setNumberFormat('ddd, dd.MM.yyyy');
  return { inserted: ins, updated: upd, total: last - 1 };
}

/**
 * Strava-Fotos in den Drive-Ordner "Strava-Fotos" (unter dem Screenshot-Ordner) laden.
 * list: [[Aktivitäts-ID, Bild-URL ohne https://], ...]. Bereits vorhandene Dateien werden übersprungen.
 */
function stravaFotosHolen_(list) {
  var root = DriveApp.getFolderById(settings_().folderId || '1eIUqBUdalzyYaMDROw1_L0V8YAzDFwIk');
  var it = root.getFoldersByName('Strava-Fotos');
  var f = it.hasNext() ? it.next() : root.createFolder('Strava-Fotos');
  var n = 0;
  list.forEach(function (x) {
    var name = x[0] + '_' + String(x[1]).split('/').pop();
    if (f.getFilesByName(name).hasNext()) return;
    f.createFile(UrlFetchApp.fetch('https://' + x[1]).getBlob().setName(name));
    n++;
  });
  return { neu: n, ordner: f.getId() };
}
