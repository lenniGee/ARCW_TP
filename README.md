# ARCW Training – Trainingsplan & Protokoll

Web-App (installierbar auf dem Smartphone) für die Trainingspläne von Marie, Alex, Junioren A und Junioren B.

- **Basis bleibt das Google Sheet** „TP bis Ergocuo“. Änderungen an den Plänen dort eintragen – die App liest sie live.
- **Sportler** sehen „Heute“, die nächsten Wochen, ihre Auswertung und die Hall of Fame und protokollieren ihre Einheiten (Minuten, km, Puls, Screenshot, Gewichte, Ergo-Belastung, Split, RPE, Kommentar).
- **Trainer** sehen, wer heute was trainiert, eine Übersicht aller Sportler (erreichte Minuten, offene Einheiten, RPE, Screenshots) und jede Auswertung im Detail.

## Aufbau

| Teil | Ort |
|---|---|
| Oberfläche (diese Dateien) | GitHub Pages |
| Backend | `apps-script/` – Google Apps Script, gebunden an das Sheet |
| Protokolle | Tab „Protokoll“ im Sheet |
| PINs / Sportler | Tab „Zugang“ im Sheet |
| Startdatum der Auswertung, Drive-Ordner | Tab „App-Einstellungen“ |
| Screenshots | Drive-Ordner „ARCW Trainingsprotokoll – Screenshots“ (ein Unterordner je Sportler) |

## Im Sheet pflegen

- **Pläne:** wie gewohnt. Wichtig: Spaltenüberschriften (Datum, Einheit, Zone, Ablauf, min/Dauer …) und die Zeilen „Woche N · …“ beibehalten.
- **Belastungsvorgaben** wie `3×10' Z3`, `4×500 m Z5` oder `5×4 min auf 1:56` im Hauptteil werden automatisch als Checkbox ins Protokoll übernommen. Tests/Wettkämpfe ebenfalls.
- **Kraftpläne Junioren:** Blöcke im Kraft-Blatt mit einer Titelzeile `EINHEIT A`, `EINHEIT B`, `PLAN B` … beginnen. Im Plan verweist „Einheit A“ bzw. „Plan B“ im Ablauf auf den Block.
- **PIN vergessen:** im Tab „Zugang“ neue PIN eintragen.
- **Neuer Sportler:** Zeile im Tab „Zugang“ ergänzen (Plan-Blatt = Name des Tabs).
- Optionale Einheiten (Text „optional“ in Einheit oder Zeit) zählen nicht zum Soll.

## Backend aktualisieren

Code aus `apps-script/` in den Apps-Script-Editor des Sheets kopieren (Erweiterungen → Apps Script) und unter
*Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version* neu bereitstellen. Die URL bleibt gleich.
