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
(enthält `model.json` und das Beispielprojekt `demo-alpha`).

## Fachregeln (V1)

- **Foundation-Prüfung (MS10), abgeleitet**: Die editierbaren Relevanz-Fragen
  je Thema (Fragen mit `milestone: "MS10"`) stehen fix ausgeklappt im
  Foundation-Block; die Titelzeile jedes Themas zeigt Zähler und den
  abgeleiteten Relevanz-Chip (eine Frage offen → Offen, eine mit Ja → Ja,
  sonst Nein; Text-Fragen zählen nicht). Als letzte Zeile steht das
  abgeleitete **Projekt architekturrelevant** (ein Thema offen → Offen, ein
  Thema relevant → Ja, sonst Nein) — beides nicht editierbar. Die
  abgeleiteten Werte werden in die Projektdatei geschrieben
  (`reviews.<id>.relevant`, `architectureRelevant`). Nur MS20-Themen haben
  MS10-Relevanzfragen; Themen späterer Meilensteine (MS40) nehmen nicht an
  der Foundation-Befragung teil, zählen nicht zur Architekturrelevanz und
  behalten eine manuell schaltbare Relevanz in ihrer Tabellenzeile. Themen
  können in späteren Meilensteinen weitere Fragen haben (Frage-Feld
  `milestone`); diese erscheinen im Ausklapp-Panel der jeweiligen
  Meilenstein-Zeile. Nicht relevante Themen sind dort ausgegraut und readonly.
- **MS10-Gate**: «nicht architekturrelevant» blendet MS20/MS40 aus; erfasste
  Daten bleiben in der Datei erhalten.
- **Relevanz**: nicht relevante Factsheets sind ausgegraut und nicht editierbar.
- **Konsistenz**: ein Ergebnis zählt nur mit gesetztem «geprüft»; wird «geprüft»
  entfernt, bleibt das Ergebnis gespeichert und wird als «noch nicht bestätigt»
  angezeigt.
- **Projektstatus** (abgeleitet, nicht gespeichert): nicht architekturrelevant /
  offen / in Ordnung / mit Conditions / nicht in Ordnung.
- **Autosave**: Änderungen werden ca. 1 Sekunde nach der letzten Eingabe
  automatisch gespeichert (Statuszeile «Automatisch gespeichert ✓ HH:MM»);
  der Speichern-Button bleibt für sofortiges Speichern. `updatedAt` wird bei
  jedem Speichern gesetzt; Konflikt­erkennung über `lastModified` (überschreiben
  oder neu laden — bei Konflikt pausiert der Autosave, bis entschieden ist).
  Beim Zurücknavigieren werden ausstehende Änderungen noch weggeschrieben.
  Unbekannte JSON-Felder überleben den Roundtrip.
- **Dokument-Links**: Klick kopiert den Pfad in die Zwischenablage
  (Browser dürfen lokale Dateien nicht direkt öffnen).
- **Ordner-Persistenz**: Der gewählte Ordner wird in IndexedDB gemerkt. Beim
  nächsten Öffnen verbindet die App automatisch; verlangt der Browser eine neue
  Bestätigung, erscheint «Wieder verbinden» auf dem Startscreen.
- **Factsheet-Info**: Das ⓘ-Icon neben jedem Factsheet-Titel öffnet einen
  Dialog mit rein statischer Information als **Markdown** (Feld `infoMd` je
  Factsheet in `model.json`; gerendert mit marked, inkl. Tabellen). Für
  Datenhaltung enthält der Standard-Katalog den Inhalt des «Factsheet
  Datenhaltung» (ehemals «Leitlinie Datenhaltungsvorgaben»), die übrigen
  Themen haben Dummy-Inhalte. Fehlt `infoMd` in einer bestehenden
  `model.json`, greift der Standard-Katalog; als letzter Fallback der
  Kurztext `description`.
- **Ausklappbare Factsheets mit Prüffragen**: Das +/−-Icon vor jedem
  Factsheet-Titel klappt ein Panel mit den Prüffragen auf. Ja/Nein sind
  echte, sich gegenseitig ausschliessende Checkboxen; «Bemerkungen …» öffnet
  beim Klick eine Textarea (bleibt offen, solange Text drinsteht). Antworten
  werden je Frage im Projekt gespeichert (`reviews.<id>.answers`, via
  Autosave). Die Fragen stehen je Factsheet in `model.json` (`questionsTitle`,
  `questions[]` mit `id`, `text`, `hint`, `kind: "text"` für offene Fragen);
  fehlen sie dort, greifen die Fragen aus dem Standard-Katalog (Datenhaltung:
  Schritt-1-Fragen S1–S4, übrige Themen: Dummy-Leitfragen). Ohne Fragen zeigt
  das Panel das Word-Dokument (`factsheetDoc`) formatiert an (mammoth.js).

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
