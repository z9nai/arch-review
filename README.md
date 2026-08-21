# Z9nAI Arch Review

Client-App für die Architekturprüfung (OnePager-Ersatz). Reine Client-Applikation
ohne Backend — die Daten liegen als JSON-Dateien in einem geteilten Ordner:
entweder in **SharePoint** (direkt über Microsoft Graph mit der
Entra-Anmeldung, jeder Browser) oder in einem **lokalen Ordner** (File System
Access API, Chrome/Edge; auch OneDrive-/Drive-Sync-Ordner). Die App liest
`model.json` (Stammdaten) und schreibt `projects/*.json`; Admins schreiben
auch `model.json`.

Gleiche Technologie und gleiches Design wie
[z9nai-hours](https://github.com/z9nai/z9nai-hours):
React 19 · TypeScript · Vite · Tailwind CSS 4 · lucide-react.

## Entwicklung

```
npm install
npm run dev        # http://localhost:3001
npm run build      # tsc --noEmit && vite build
```

## Anmeldung (Microsoft Entra ID)

Optional meldet die App Benutzer über **Microsoft Entra ID** an (MSAL im
Browser, Authorization Code Flow + PKCE, kein eigener Server). Konfiguriert
wird im **Admin → Anmeldung** (Tenant-ID, Client-ID, Rollen, aktiv);
die Einstellung liegt als `auth` in der `model.json` und gilt für alle
Benutzer des Ordners. Für den SharePoint-Modus müssen Tenant-/Client-ID
schon vor dem Ordner bekannt sein — sie werden einmalig pro Browser
hinterlegt: per **Einrichtungs-Link** (`?tenant=…&client=…&folder=…`,
verbindet nach dem Login auch gleich den SharePoint-Ordner; Admin →
Anmeldung → Für Benutzer) oder manuell im Einrichtungsdialog. Nichts davon
liegt im Repo oder Deployment. Ist sie aktiv, erscheint ein Login-Gate (nach dem
Laden der model.json bzw. — dank lokal gemerkter Konfiguration — direkt
beim Start); die angemeldete Person steht oben rechts
(Abmelden daneben), «Prüfer/in» wird bei der Freigabe vorbelegt. Drei Zugriffsstufen über
Entra-App-Rollen: **Admin** (alles), **Reviewer** (Reviews bearbeiten, kein
Admin-Modus), **Viewer** (alles nur lesen, PDFs exportieren); die höchste
passende Rolle gewinnt. Wichtig: Die Anmeldung ist ein Zugangs-Gate für die
Oberfläche — die Daten schützt die Berechtigung des geteilten Ordners.
Einrichtung Schritt für Schritt: [docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md).
Entwicklung ohne Login: `?noauth` (nur Dev-Server), Stufen simulieren mit `&as=viewer` / `&as=reviewer`.

## Datenablage im geteilten Ordner

Beim Start wählt man **SharePoint-Ordner verbinden** (Link zum Ordner
einfügen; Anmeldung mit dem Microsoft-Konto; SharePoint setzt die
Berechtigungen serverseitig durch — Viewer mit «Lesen» können nichts
schreiben) oder **Lokalen Ordner wählen**. Beides wird gemerkt und beim
nächsten Start automatisch verbunden. Technisch steckt dahinter eine
Backend-Schnittstelle (`src/backend.ts`: `LocalBackend`, `src/graph.ts`:
`GraphBackend`) mit Versionen für die Konflikterkennung (lastModified bzw.
ETag; Graph: `If-Match` → 412, Anlegen mit `conflictBehavior=fail`).
Einrichtung: [docs/SHAREPOINT-SETUP.md](docs/SHAREPOINT-SETUP.md).
Entwicklung: `?graph=http://localhost:3999/v1.0` leitet Graph auf einen Mock um.

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

- **M10 · Foundation-Prüfung**: müssen alle Projekte ausfüllen. Kopf mit
  abgeleitetem Tag **Architekturrelevant** (ein Thema offen → Offen, ein
  Thema relevant → Ja, sonst Nein; nicht editierbar) und der
  **Klassifikation** als Teil der Freigabe: Sind alle Fragen mit Nein
  beantwortet, steht sie automatisch auf der ersten Stufe («nicht
  relevant»); sonst wählt der/die Architekt/in eine der weiteren Stufen
  (Standard: **relevant** oder **wegweisend**; das ⓘ öffnet die Erklärung).
  Dazu Checkbox **«Geprüft und freigegeben»** mit Feld «Prüfer/in»
  und Pflicht-Bemerkungen (Textarea wächst mit dem Text). Darunter je Thema
  ein aufklappbarer Fragenblock (+/−) mit Zähler und abgeleitetem
  Relevanz-Chip (eine Frage offen → Offen, eine mit Ja → Ja, sonst Nein;
  Text-Fragen zählen nicht). Die abgeleiteten Werte werden in die
  Projektdatei geschrieben (`reviews.<themeId>.relevant`,
  `architectureRelevant`).
- **Meilenstein-Kaskade (M20 → M40)**: Jeder Block erscheint, sobald der
  vorherige freigegeben ist — und nur wenn die Klassifikation auf
  **relevant** oder höher steht («nicht relevant» → kein M20/M40). Aufbau analog M10 (Status-Tag «Ergebnis», Freigabe, Prüfer/in,
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
  architekturrelevant / offen / abgeschlossen (M40 freigegeben). Offene
  Projekte zeigen in der Projektliste zusätzlich ein Tag mit dem
  Meilenstein, an dem sie gerade stehen (erster nicht freigegebener,
  z. B. «M20 offen»).
- **Autosave**: Änderungen werden ca. 1 Sekunde nach der letzten Eingabe
  automatisch gespeichert (Statusleiste unten, analog Admin-Modus:
  «Automatisch gespeichert ✓ HH:MM» und «schreibt projects/‹slug›.json»;
  ohne separaten Speichern-Button);
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
  «Prüfformular Datenhaltung, Schritt 2») und eine **Mindest-Klassifikation**
  («ab wegweisend», kumulativ nach Reihenfolge): Solche Fragen erscheinen
  nur, wenn die Klassifikation des Projekts hoch genug ist; die Nummern
  bleiben dabei stabil (ausgeblendete Fragen hinterlassen Lücken). Ohne
  Angabe gilt die Frage für alle Klassifikationen; M10-Fragen werden nie
  gefiltert (die Klassifikation ist ja gerade deren Ergebnis).
- **Klassifikation** (`classifications` in `model.json`): geordnete,
  editierbare Stufen — Standard **nicht relevant / relevant / wegweisend**.
  Die erste Stufe wird automatisch gesetzt, wenn alle M10-Fragen Nein sind;
  ab der zweiten Stufe werden M20/M40 geprüft.
- Alte `model.json`-Dateien werden beim Laden automatisch überführt: das
  Factsheet-Format (MSxx-Nummern) in die Themen/Fragen-Struktur, das
  v2-Format mit Prüftiefen in die dreistufige Klassifikation (alte
  «ab L»-Fragen werden zu «ab wegweisend», «ab M» entfällt); MS60-Zuordnungen
  landen in M40.

## Admin-Modus

Der Button **Admin** in der Kopfleiste öffnet die Pflege der Stammdaten.
**Klassifikationen** sind vollständig editierbar (hinzufügen/löschen, Label,
Reihenfolge per ↑/↓ — die Reihenfolge definiert die aufsteigenden Stufen
für «ab …»-Fragen; die erste Stufe gilt als «nicht relevant»); beim Löschen
einer Klassifikation werden «ab …»-Verweise in Fragen bereinigt. Dazu die
Erklärung als Markdown (hinter dem ⓘ bei der Klassifikation im M10). Je Meilenstein-Gruppe gibt es eine
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
**PDF-Formular**:
ein ausfüllbares PDF (AcroForm) mit denselben offenen Fragen — Ja/Nein als
Checkboxen, Auswahl-Fragen als Dropdown, Bemerkungen als mehrzeilige
Textfelder. Erzeugt wird es lokal über ein mitgebundeltes pdf-lib (eigener
Lazy-Chunk, keine Netzwerkzugriffe); die Formularfelder tragen stabile Namen,
damit das ausgefüllte PDF wieder importiert werden kann.

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

Alternativ nimmt derselbe Dialog über **«Ausgefülltes PDF wählen»** das
ausgefüllte PDF-Formular entgegen: Die Antworten werden aus den
Formularfeldern gelesen (gleiche Regeln — Ja und Nein zugleich angekreuzt →
Frage bleibt unangetastet, leere Felder werden ignoriert) und über dieselbe
Vorschau übernommen.

## Review-PDF (Bericht)

Der Button **«Review-PDF»** im Projektkopf (neben MS10-Import) erzeugt
jederzeit einen PDF-Bericht des Architektur-Reviews. Zuoberst steht der
**Status auf einen Blick** — je erreichter Meilenstein ein Badge
(**ABGENOMMEN** grün / **OFFEN** orange) mit Anzahl offener Fragen, beim
M10 zusätzlich die Architekturrelevanz mit Klassifikation. Noch nicht
erreichte Meilensteine erscheinen grau mit Grund («folgt nach Freigabe des
vorherigen Meilensteins» bzw. «entfällt: nicht architekturrelevant»).
Danach folgen die Details je Meilenstein: Freigabe (Prüfer/in,
Bemerkungen) und alle Themen mit Fragen und Antworten (Antwort
rechtsbündig, offene Fragen orange; Bemerkungen eingerückt); nicht
relevante Themen stehen als «Kein Review nötig»-Zeile. Erzeugt lokal über
pdf-lib, Dateiname `architektur-review-<slug>.pdf`.

## MS10-Import

Aus einem MS10-Antrags-PDF (Vorlage «MS10 Antrag - Light») lassen sich Felder
übernehmen — zwei Wege:

- **Projektliste → «Import MS10-PDF»**: befüllt das Neues-Projekt-Formular vor
  (Name, Slug) und übernimmt beim Anlegen alle gefundenen Felder.
- **OnePager → «MS10-Import»**: zeigt die gefundenen Felder in einem
  Vorschau-Dialog; «Übernehmen» schreibt sie in das Formular (der Autosave
  speichert anschliessend).

Übernommen werden: Projektname und KP-Nummer (aus dem Titel),
Ausgangslage/Motivation → Beschrieb (volle Breite im Titel-Panel),
Projektleiter/in → Verantwortlich Projekt,
Architektur-Checkboxen → architekturrelevant (nur wenn angekreuzt) sowie eine
Zusammenfassung (PL Stv, Auftraggeber, Leistungstyp, Projekttyp,
Projektklasse, Laufzeit) in die Notizen der Foundation-Prüfung. Der Import ist best-effort: Was im PDF
nicht gefunden wird, bleibt leer; ein erneuter Import derselben Datei erzeugt
keine Duplikate. PDF-Parsing läuft lokal über ein mitgebundeltes pdf.js
(eigener Lazy-Chunk, keine Netzwerkzugriffe).
