/**
 * ARCW Trainingsplan – Parser
 * Reine Funktionen ohne Google-APIs (auch mit Node testbar).
 * Liest die Plan-Blätter (Marie, Alex, Junioren A, Junioren B) und die Kraft-Blätter.
 */

var PARSER = (function () {

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  }

  function str(v) {
    return v == null ? '' : String(v).trim();
  }

  /** Spalten anhand der Überschriften erkennen (robust gegen eingefügte Spalten). */
  function mapHeader(row) {
    var map = {};
    row.forEach(function (cell, i) {
      var h = norm(cell);
      if (!h) return;
      if (map.date == null && /^datum/.test(h)) map.date = i;
      else if (map.dow == null && /^tag$/.test(h)) map.dow = i;
      else if (map.week == null && /^(wo|woche)\.?$/.test(h)) map.week = i;
      else if (map.phase == null && /^(block|phase)/.test(h)) map.phase = i;
      else if (map.time == null && /^(uhrzeit|zeit)/.test(h)) map.time = i;
      else if (map.title == null && /^einheit/.test(h)) map.title = i;
      else if (map.zone == null && /^zone/.test(h)) map.zone = i;
      else if (map.text == null && /^ablauf/.test(h)) map.text = i;
      else if (map.minutes == null && (/^min/.test(h) || /^dauer/.test(h))) map.minutes = i;
      else if (map.ersatz == null && /^ersatz/.test(h)) map.ersatz = i;
      else if (map.note == null && /hinweis/.test(h)) map.note = i;
    });
    return map;
  }

  function findHeaderRow(values) {
    for (var r = 0; r < Math.min(values.length, 30); r++) {
      var m = mapHeader(values[r]);
      if (m.title != null && m.text != null && m.date != null) return { row: r, map: m };
    }
    return null;
  }

  /** Text "Warm-up (10'): ...\nHauptteil (..)..." in Abschnitte zerlegen. */
  function splitSections(text) {
    var out = { warmup: '', main: '', cooldown: '', other: '' };
    if (!text) return out;
    var current = 'other';
    String(text).split(/\n/).forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      var low = l.toLowerCase();
      if (/^warm[\s-]?up/.test(low)) current = 'warmup';
      else if (/^hauptteil/.test(low)) current = 'main';
      else if (/^cool[\s-]?down/.test(low)) current = 'cooldown';
      out[current] += (out[current] ? '\n' : '') + l;
    });
    return out;
  }

  function stripLabel(s) {
    return String(s || '').replace(/^(warm[\s-]?up|hauptteil|cool[\s-]?down)\s*(\([^)]*\))?\s*:\s*/i, '');
  }

  /**
   * Belastungs-Vorgaben aus dem Hauptteil erkennen, z. B. "3×10' Z3", "4×500 m Z5", "5×4 min auf 1:56".
   * Diese landen automatisch als Checkbox im Protokoll.
   */
  function extractHints(text) {
    if (!text) return [];
    var s = stripLabel(String(text));
    var re = /(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*('|’|min\b|km\b|m\b|s\b)/g;
    var hints = [];
    var m;
    while ((m = re.exec(s)) !== null) {
      var start = m.index;
      var rest = s.slice(start);
      // bis zum nächsten Trenner
      var end = rest.search(/[;+]|,(?![^()]*\))|(?<!\bca)(?<!\d)\.(?:\s|$)|\n/);
      var chunk = (end === -1 ? rest : rest.slice(0, end)).trim();
      if (chunk.length > 90) chunk = chunk.slice(0, 90).replace(/\s+\S*$/, '') + ' …';
      // offene Klammer abschneiden
      var open = (chunk.match(/\(/g) || []).length, close = (chunk.match(/\)/g) || []).length;
      if (open > close) chunk = chunk.slice(0, chunk.lastIndexOf('(')).trim();
      var probe = rest.slice(0, 60);
      if (/Z\d|Renntempo|Langstreckentempo|auf \d:\d\d|Zielsplit|Wettkampftempo/i.test(probe)) {
        if (hints.indexOf(chunk) === -1) hints.push(chunk);
      }
    }
    return hints;
  }

  function isTestUnit(title, zone) {
    return /test|cup|versuch|rangliste|langstrecke\b/i.test(title) || /^test$/i.test(zone);
  }

  function classify(title, text, minutes) {
    var t = norm(title);
    if (!t || /^(frei|—|–|-)$/.test(t) || (/^(frei|ruhetag)/.test(t) && !minutes)) return 'rest';
    if (/kraft/.test(t)) return 'kraft';
    if (!minutes && /^kein|^keine|ruhetag/i.test(String(text || ''))) return 'rest';
    return 'ausdauer';
  }

  function guessSport(title, text) {
    var t = norm(title) + ' ' + norm(String(text || '').split('\n').filter(function (l) { return /^hauptteil/i.test(l.trim()); }).join(' '));
    var tt = norm(title);
    if (/boot|rudern|kleinboot|langstrecke|rangliste/.test(tt)) return 'Rudern';
    if (/ergo/.test(tt)) return 'Ergo';
    if (/lauf/.test(tt)) return 'Laufen';
    if (/spinning|rad\b|rad\/|bike/.test(tt)) return 'Rad/Spinning';
    if (/schwimm/.test(tt)) return 'Schwimmen';
    if (/halle/.test(tt)) return 'Hallensport';
    if (/yoga|mobilit|regeneration/.test(tt)) return 'Mobilität/Yoga';
    if (/ergo/.test(t)) return 'Ergo';
    if (/bike|rad/.test(t)) return 'Rad/Spinning';
    if (/lauf/.test(t)) return 'Laufen';
    return 'Sonstiges';
  }

  /** Bei Kraft-Einheiten den Block erkennen: "Einheit A", "Plan B", "Kraft A (Max)". */
  function kraftBlockOf(title, text) {
    var m = String(text || '').match(/(?:Einheit|Plan)\s+([A-Z])\b/);
    if (m) return m[1];
    m = String(title || '').match(/Kraft\s+([A-Z])\b/);
    if (m) return m[1];
    return null;
  }

  /** Übungen aus Fließtext (Marie/Alex): "Kniebeuge 3×10, Bankziehen 3×10; Core-Zirkel ..." */
  function exercisesFromText(text) {
    var main = splitSections(text).main;
    main = stripLabel(main);
    if (!main) return [];
    var parts = main.split(/[,;]\s*(?![^()]*\))/);
    var list = [];
    parts.forEach(function (p) {
      p = p.trim().replace(/^(dann|danach|und)\s+/i, '');
      var m = p.match(/^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 .\-\/]{1,45}?)\s+(\d+\s*[×x]\s*[^\s,;]+(?:\s*(?:\/|pro)\s*Seite)?)/);
      if (m) {
        var name = m[1].trim();
        if (/^(pause|warm|cool)/i.test(name)) return;
        list.push({ name: name, sets: m[2].trim(), hint: '' });
      }
    });
    return list;
  }

  function toISODate(v, fmt) {
    if (v instanceof Date && !isNaN(v)) return fmt(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    if (typeof v === 'string') {
      var m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    return null;
  }

  /**
   * Plan-Blatt parsen.
   * values: 2D-Array (getValues), fmt: Date -> 'yyyy-MM-dd'
   */
  function parsePlan(sheetName, values, fmt) {
    var hdr = findHeaderRow(values);
    if (!hdr) return { sheet: sheetName, units: [], weeks: [], error: 'Kopfzeile nicht gefunden' };
    var c = hdr.map;
    var units = [], weeks = {}, weekOrder = [];
    var currentWeek = null;
    var perDay = {};
    for (var r = hdr.row + 1; r < values.length; r++) {
      var row = values[r];
      var first = str(row[0]);
      var wm = first.match(/^Woche\s+(\d+)\s*(.*)$/i);
      if (wm) {
        currentWeek = Number(wm[1]);
        var rest = wm[2].replace(/^[\s·\-–]+/, '');
        var bits = rest.split(/\s*·\s*/);
        weeks[currentWeek] = {
          week: currentWeek,
          range: bits[0] || '',
          label: bits.slice(1).join(' · '),
          note: c.text != null ? str(row[c.text]) : ''
        };
        weekOrder.push(currentWeek);
        continue;
      }
      var date = toISODate(row[c.date], fmt);
      if (!date) continue;
      var title = str(row[c.title]);
      var text = c.text != null ? str(row[c.text]) : '';
      if (!title && !text) continue;
      var minutes = c.minutes != null ? Number(row[c.minutes]) || 0 : 0;
      var week = c.week != null && row[c.week] !== '' && !isNaN(Number(row[c.week])) ? Number(row[c.week]) : currentWeek;
      var phase = c.phase != null ? str(row[c.phase]) : '';
      if (week != null && !weeks[week]) {
        weeks[week] = { week: week, range: '', label: phase, note: '' };
        weekOrder.push(week);
      }
      var time = c.time != null ? row[c.time] : '';
      if (time instanceof Date) time = ('0' + time.getHours()).slice(-2) + ':' + ('0' + time.getMinutes()).slice(-2);
      time = str(time);
      perDay[date] = (perDay[date] || 0) + 1;
      var idx = perDay[date];
      var type = classify(title, text, minutes);
      var ersatz = c.ersatz != null ? str(row[c.ersatz]) : '';
      var zone = c.zone != null ? str(row[c.zone]) : '';
      var hints = type === 'rest' ? [] : extractHints(splitSections(text).main || text);
      if (type !== 'rest' && isTestUnit(title, zone)) hints.unshift('Test/Wettkampf absolviert: ' + title);
      var unit = {
        key: sheetName + '|' + date + '|' + idx,
        sheet: sheetName,
        row: r + 1,
        date: date,
        dow: c.dow != null ? str(row[c.dow]) : '',
        week: week,
        phase: phase,
        time: time === '–' || time === '—' ? '' : time,
        title: title,
        zone: zone === '–' || zone === '—' ? '' : zone,
        text: text,
        sections: splitSections(text),
        ersatz: ersatz,
        ersatzSections: ersatz ? splitSections(ersatz) : null,
        note: c.note != null ? str(row[c.note]) : '',
        minutes: minutes,
        type: type,
        sport: type === 'ausdauer' ? guessSport(title, text) : (type === 'kraft' ? 'Kraft' : ''),
        optional: /optional/i.test(title + ' ' + time),
        hints: hints,
        hintsErsatz: ersatz ? extractHints(splitSections(ersatz).main || ersatz) : [],
        kraftBlock: type === 'kraft' ? kraftBlockOf(title, text) : null,
        exercises: type === 'kraft' ? exercisesFromText(text) : []
      };
      units.push(unit);
    }
    return {
      sheet: sheetName,
      units: units,
      weeks: weekOrder.map(function (w) { return weeks[w]; })
    };
  }

  /**
   * Kraft-Blatt parsen. Blöcke werden über Titelzeilen "EINHEIT A" / "PLAN B" erkannt.
   * links: optionales 2D-Array mit Link-URLs (gleiche Größe wie values).
   */
  function parseKraft(sheetName, values, links) {
    var blocks = {};
    var order = [];
    var current = null, cols = null, lastBlockLabel = '';
    var pendingName = null;
    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var a = str(row[0]);
      var m = a.match(/^(?:EINHEIT|PLAN)\s+([A-Z])\b/i);
      if (m) { pendingName = m[1].toUpperCase(); cols = null; current = null; continue; }
      var hasUebung = row.some(function (v) { return norm(v) === 'übung'; });
      if (hasUebung) {
        cols = {};
        row.forEach(function (v, i) {
          var h = norm(v);
          if (h === 'block') cols.block = i;
          else if (/^nr/.test(h)) cols.nr = i;
          else if (h === 'übung') cols.name = i;
          else if (/^material/.test(h)) cols.material = i;
          else if (/^sätze/.test(h)) cols.sets = i;
          else if (/^wdh/.test(h)) cols.reps = i;
          else if (/^pause/.test(h)) cols.pause = i;
          else if (/^dauer/.test(h)) cols.duration = i;
          else if (/hinweis/.test(h)) cols.hint = i;
          else if (/video/.test(h)) cols.video = i;
        });
        var name = pendingName || String.fromCharCode(65 + order.length);
        while (blocks[name]) name = String.fromCharCode(name.charCodeAt(0) + 1);
        current = { name: name, exercises: [], total: null };
        blocks[name] = current;
        order.push(name);
        pendingName = null;
        lastBlockLabel = '';
        continue;
      }
      if (!current || !cols) continue;
      if (/gesamtdauer/i.test(a)) {
        current.total = cols.duration != null ? Number(row[cols.duration]) || null : null;
        current = null; cols = null;
        continue;
      }
      var exName = str(row[cols.name]);
      if (!exName) continue;
      if (cols.block != null && str(row[cols.block])) lastBlockLabel = str(row[cols.block]);
      var reps = cols.reps != null ? row[cols.reps] : '';
      if (typeof reps === 'number') reps = String(reps);
      current.exercises.push({
        nr: cols.nr != null ? str(row[cols.nr]) : '',
        block: lastBlockLabel,
        name: exName,
        material: cols.material != null ? str(row[cols.material]) : '',
        sets: cols.sets != null && row[cols.sets] !== '' ? Number(row[cols.sets]) : '',
        reps: str(reps),
        pause: cols.pause != null && row[cols.pause] !== '' ? Number(row[cols.pause]) : '',
        hint: cols.hint != null ? str(row[cols.hint]) : '',
        video: cols.video != null && links && links[r] ? (links[r][cols.video] || '') : '',
        weighted: !/^(warm|cool)/i.test(lastBlockLabel)
      });
    }
    return { sheet: sheetName, blocks: blocks, order: order };
  }

  return {
    parsePlan: parsePlan,
    parseKraft: parseKraft,
    extractHints: extractHints,
    exercisesFromText: exercisesFromText,
    splitSections: splitSections
  };
})();

if (typeof module !== 'undefined') module.exports = PARSER;
