# Z9nAI Arch Review

Client-App für die Architekturprüfung (OnePager-Ersatz). Reine Client-Applikation
ohne Backend — die Daten liegen als JSON-Dateien in einem geteilten Ordner
(z. B. Google Drive), den die App über die File System Access API wählt
(Chrome/Edge). Die App liest `model.json` (Stammdaten, nur lesend) und
schreibt ausschliesslich `projects/*.json`.

Gleiche Technologie und gleiches Design wie
[z9nai-hours](https://github.com/z9nai/z9nai-hours):
React 19 · TypeScript · Vite · Tailwind CSS 4 · lucide-react.

## Entwicklung

```
npm install
npm run dev        # http://localhost:3001
npm run build      # tsc --noEmit && vite build
```

## Datenablage im geteilten Ordner

```
<geteilter Ordner>/
├── model.json              Stammdaten (Katalog), nur gelesen
├── projects/
│   └── <slug>.json         eine Datei pro Projekt (Review-Zustand)
├── factsheets/             Word-Vorgaben (nur verlinkt)
└── projekte/               Word-Nachweise (nur verlinkt)
```

Fehlen `model.json` oder `projects/` im gewählten Ordner, legt die App sie an
(`model.json` mit dem Standard-Katalog aus `src/defaultModel.ts`). Eine
vorhandene, aber defekte `model.json` wird nie überschrieben.

Zum Ausprobieren kann `sample-data/` als geteilter Ordner gewählt werden
(enthält `model.json` und das Beispielprojekt «Core Datenbank Migration»).

## Fachregeln (V1)

- **M10 · Foundation-Prüfung**: Kopf mit abgeleitetem Tag **Architekturrelevant**
  (ein Thema offen → Offen, ein Thema relevant → Ja, sonst Nein; nicht
  editierbar), Checkbox **«Geprüft und freigegeben»** mit Feld «Prüfer/in»
  und Pflicht-Bemerkungen (Textarea wächst mit dem Text). Darunter je Thema
  ein aufklappbarer Fragenblock (+/−) mit Zähler und abgeleitetem
  Relevanz-Chip (eine Frage offen → Offen, eine mit Ja → Ja, sonst Nein;
  Text-Fragen zählen nicht). Die abgeleiteten Werte werden in die
  Projektdatei geschrieben (`reviews.<themeId>.relevant`,
  `architectureRelevant`).
- **Meilenstein-Kaskade (M20 → M40)**: Jeder Block erscheint, sobald der
  vorherige freigegeben ist — und nur solange die Architekturrelevanz nicht
  Nein ist. Aufbau analog M10 (Status-Tag «Ergebnis», Freigabe, Prüfer/in,
  Pflicht-Bemerkungen; gespeichert unter `reviews.m20` / `reviews.m40`).
  Themen, die laut Foundation keinen Review brauchen (relevant = Nein), sind
  ausgegraut, readonly und auf Nein gesetzt («kein Review nötig»).
- **Fragen beantworten**: Ja/Nein sind sich gegenseitig ausschliessende
  Checkboxen; «Bemerkungen …» öffnet beim Klick eine Textarea (bleibt offen,
  solange Text drinsteht). Antworten hängen am stabilen Frage-Schlüssel in
  `reviews.<themeId>.answers`.
- **Themen-Info**: Das ⓘ-Icon öffnet die statische Info des Themas als
  gerendertes Markdown (`infoMd`; für Datenhaltung der Inhalt des Factsheets
  Datenhaltung, ehemals «Leitlinie Datenhaltungsvorgaben»).
- **Projektstatus** (abgeleitet, nicht gespeichert): nicht
  architekturrelevant / offen / abgeschlossen (M40 freigegeben).
- **Autosave**: Änderungen werden ca. 1 Sekunde nach der letzten Eingabe
  automatisch gespeichert (Statuszeile «Automatisch gespeichert ✓ HH:MM»);
  `updatedAt` wird gesetzt, Konflikte werden über `lastModified` erkannt
  (überschreiben oder neu laden). Beim Zurücknavigieren werden ausstehende
  Änderungen noch weggeschrieben. Unbekannte JSON-Felder überleben den
  Roundtrip.
- **Ordner-Persistenz**: Der gewählte Ordner wird in IndexedDB gemerkt; beim
  nächsten Öffnen verbindet die App automatisch oder bietet «Wieder
  verbinden» an.

## Datenmodell (v2)

- **Meilensteine** sind fix und hart codiert: **M10 / M20 / M40**
  (Konstante `MILESTONES` in `src/types.ts`; Titel in `MILESTONE_TITLES`).
- **Themen**: nur Titel und Info (Markdown, hinter dem ⓘ-Icon). Die
  Nummerierung **A–Z** ergibt sich automatisch aus der Reihenfolge.
- **Fragen**: ein Text, per Dropdown einem Meilenstein und einem Thema
  zugeordnet; optional Antworttyp (**Ja/Nein**, **Text** oder **Auswahl**
  mit vorgegebenen Optionen, z. B. Schutzklasse K0–K4) und Erläuterung. Die
  angezeigte Nummer wird automatisch vergeben (n-te Frage des Themas im
  Meilenstein, z. B. **M10F1**); intern hängt jede Frage an einem stabilen
  Schlüssel, damit Antworten beim Umsortieren erhalten bleiben. Optional
  trägt eine Frage eine **Quelle** (wird unter der Frage angezeigt, z. B.
  «Prüfformular Datenhaltung, Schritt 2») und eine **Mindest-Prüftiefe**
  («ab M», «ab L», kumulativ): Solche Fragen erscheinen nur, wenn die
  Prüftiefe des Projekts hoch genug ist; die Nummern bleiben dabei stabil
  (ausgeblendete Fragen hinterlassen Lücken). Ohne Angabe gilt die Frage
  für alle Prüftiefen. Die Klassifikation bleibt bewusst auf Projektebene —
  sie soll später die Prüftiefe ableiten (Regel folgt), nicht einzelne
  Fragen filtern.
- Alte `model.json`-Dateien (Factsheet-Format mit MSxx-Nummern) werden beim
  Laden automatisch in die neue Struktur überführt; MS60-Zuordnungen landen
  in M40.

## Admin-Modus

Der Button **Admin** in der Kopfleiste öffnet die Pflege der Stammdaten.
**Klassifikationen** (hinzufügen/löschen, Label, Zuordnung zur Prüftiefe)
und **Prüftiefen** (hinzufügen/löschen, Label, PT-Aufwand, Reihenfolge per
↑/↓ — die Reihenfolge definiert die aufsteigende Tiefe für «ab …»-Fragen)
sind vollständig editierbar; beim Löschen einer Prüftiefe werden Verweise
in Klassifikationen und Fragen bereinigt. Je Meilenstein-Gruppe gibt es eine
**Katalogsuche**: Tippen filtert live über Fragetext, Thema und Quelle durch
den eingebauten Fragenkatalog (Standard-Fragen plus kuratierte Fragen aus
AWS Well-Architected, OWASP ASVS, BSI IT-Grundschutz, TOGAF, arc42/aim42 und
CH-DSG in `src/catalog.ts` — jeweils mit Quellenangabe); ein Klick übernimmt
die Frage; Klick ins leere Feld zeigt sofort alle verfügbaren Fragen des
Meilensteins. Die **Quelle** ist reiner Text (nicht editierbar); eigene
Fragen zeigen «Quelle: ‹Firma›» — der Firmenname ist im Admin
konfigurierbar (`company` in `model.json`). Jede Frage hat zudem einen
**aktiv-Schalter**: Deaktivierte Fragen bleiben in `model.json` erhalten,
werden im OnePager aber nicht gestellt (Nummern bleiben stabil). Dazu:
**Themen** (Titel + Info-Markdown, A–Z automatisch) und **Fragen** (Text,
Meilenstein- und Themen-Dropdown, Antworttyp, Erläuterung; Nummer
automatisch) lassen sich on the fly erstellen, anpassen und löschen.
Gespeichert wird per Autosave direkt in die `model.json` im geteilten
Ordner; Änderungen wirken sofort für alle Projekte. Beim Löschen eines
Themas werden seine Fragen mitgelöscht; bereits erfasste Antworten bleiben
in den Projektdateien erhalten.

## Export «Offene Fragen»

Jeder Meilenstein-Block hat einen Button **«Offene Fragen»**: Er erzeugt
einen E-Mail-tauglichen Text mit allen noch unbeantworteten Fragen des
Meilensteins (nur relevante Themen; Ja/Nein-Fragen im Ankreuzformat
«[ ] Ja  [ ] Nein» mit Bemerkungszeile, Auswahl-Fragen mit den Optionen,
Text-Fragen mit «Antwort / Bemerkung:», Hinweise in Klammern). Der Dialog
zeigt die Anzahl, den Text zum Prüfen sowie **Kopieren** (Zwischenablage,
mit «✓ Kopiert»-Feedback und Fallback für restriktive Umgebungen) und
**E-Mail-Entwurf öffnen** (mailto mit Betreff und Text).

Der Rückweg: **«Antworten importieren»** (daneben) nimmt den ausgefüllten
E-Mail-Text entgegen. Erkannt werden angekreuzte Ja/Nein-Checkboxen
(tolerant: «[x]», «[X]», «[]», auch ein alleinstehendes «Ja»/«Nein» als
Antwortzeile), Auswahl-Antworten (gegen die Optionen abgeglichen; unbekannte
Werte landen in den Bemerkungen) und Bemerkungen — diese laufen ab
«Bemerkung:» bis zur nächsten Frage, über mehrere Zeilen und Absätze.
Zitatzeichen («> ») aus E-Mail-Antworten werden entfernt. Die Zuordnung läuft
über die Themen-Titel und Fragenummern aus dem Export — eine Vorschau zeigt
die erkannten Antworten, «Übernehmen» schreibt sie ins Projekt (Autosave,
Relevanz-Ableitung inklusive). Beide Ankreuzungen oder keine → die Frage
bleibt unangetastet.

## MS10-Import

Aus einem MS10-Antrags-PDF (Vorlage «MS10 Antrag - Light») lassen sich Felder
übernehmen — zwei Wege:

- **Projektliste → «Import MS10-PDF»**: befüllt das Neues-Projekt-Formular vor
  (Name, Slug) und übernimmt beim Anlegen alle gefundenen Felder.
- **OnePager → «MS10-Import»**: zeigt die gefundenen Felder in einem
  Vorschau-Dialog; «Übernehmen» schreibt sie in das Formular (gespeichert wird
  erst mit «Speichern»).

Übernommen werden: Projektname und KP-Nummer (aus dem Titel),
Ausgangslage/Motivation → Beschrieb (volle Breite im Titel-Panel),
Projektleiter/in → Verantwortlich Projekt, Projektklasse S/M/L → Prüftiefe,
Architektur-Checkboxen → architekturrelevant (nur wenn angekreuzt) sowie eine
Zusammenfassung (PL Stv, Auftraggeber, Leistungstyp, Projekttyp, Laufzeit) in
die Notizen der Foundation-Prüfung. Der Import ist best-effort: Was im PDF
nicht gefunden wird, bleibt leer; ein erneuter Import derselben Datei erzeugt
keine Duplikate. PDF-Parsing läuft lokal über ein mitgebundeltes pdf.js
(eigener Lazy-Chunk, keine Netzwerkzugriffe).
