# SharePoint als gemeinsamer Ordner — Einrichtung (Testumgebung und Produktion)

Die App kann ihre Daten (`config/model.json`, `projects/*.json`) direkt in einer
SharePoint-Dokumentbibliothek lesen und schreiben — über Microsoft Graph, mit
dem Token der Entra-Anmeldung. Kein Sync-Client, keine Konfliktkopien,
Berechtigungen werden von SharePoint pro Person durchgesetzt.

## Teil 1 · Voraussetzung prüfen: Gibt es SharePoint im Tenant?

SharePoint ist Teil von Microsoft 365 (Business Basic/Standard/Premium, E3/E5),
**nicht** von Entra ID allein. Prüfen:

1. <https://admin.microsoft.com> → **Abrechnung → Ihre Produkte**: Steht dort
   ein Microsoft-365-Plan mit SharePoint (alle ausser «Entra ID» / «Azure»)?
2. Oder direkt `https://<tenantname>.sharepoint.com` aufrufen — öffnet sich
   eine Startseite, ist SharePoint da. (`tenantname` = der Teil vor
   `.onmicrosoft.com`, z. B. `z9nai`.)

**Falls kein Plan vorhanden** (nur Entra ID Free): Für den Test reicht die
kostenlose Testversion **Microsoft 365 Business Basic** (1 Monat, bis 25
Benutzer): admin.microsoft.com → **Abrechnung → Dienste kaufen** →
*Microsoft 365 Business Basic* → **Kostenlose Testversion starten**.
Danach dem eigenen Konto und den Testbenutzern eine Lizenz zuweisen
(**Benutzer → Aktive Benutzer → Benutzer → Lizenzen und Apps**). SharePoint
steht ca. 15–30 Minuten später bereit. Wird die Testversion nicht
verlängert, läuft sie einfach aus.

## Teil 2 · Site und Ordner anlegen

Am einfachsten über **Teams** (erzeugt automatisch eine SharePoint-Site mit
Dokumentbibliothek und sauberen Berechtigungen):

1. Teams → **Teams → Team erstellen → Von Grund auf neu → Privat**, Name
   `Architekturprüfung`.
2. Im Kanal «Allgemein» → Reiter **Dateien** → **Neu → Ordner** → `arch-review`.
3. Ordner öffnen → oben **… → Details** oder **Link kopieren** → das ist der
   Link, den die App beim Verbinden braucht (Form
   `https://<tenant>.sharepoint.com/:f:/s/Architekturpruefung/...` oder
   `https://<tenant>.sharepoint.com/sites/Architekturpruefung/Freigegebene%20Dokumente/arch-review`).

Ohne Teams: <https://<tenant>.sharepoint.com> → **Website erstellen →
Teamwebsite**, Name `Architekturprüfung`, dann in **Dokumente** den Ordner
`arch-review` anlegen und den Link kopieren.

Die App legt `config/model.json` und den Unterordner `projects/` beim ersten
Verbinden selbst an, falls sie fehlen. Danach dem Ordner `config/` eigene
Berechtigungen geben (Teil 3b).

## Teil 3 · Berechtigungen = Zugriffsstufen

SharePoint prüft serverseitig, wer lesen und schreiben darf — unabhängig von
den App-Rollen. Beides sollte zusammenpassen:

| App-Rolle (Entra) | SharePoint-Berechtigung auf der Site / dem Ordner |
|---|---|
| Admin | **Bearbeiten** (Mitglied/Besitzer) |
| Reviewer | **Bearbeiten** (Mitglied) |
| Viewer | **Lesen** (Besucher) — oder **Bearbeiten**, wenn Viewer kommentieren sollen (Kommentare sind Dateien; die App hält Viewer am Review trotzdem auf Nur-Lesen) |

Die vollständige Rechte-Matrix je Rolle (Review, Quellen, Kommentare,
Admin) und die Liste der Graph-Berechtigungen stehen in
[ENTRA-SETUP.md](ENTRA-SETUP.md), Abschnitte A3 und A4.

Bei einem Teams-Team: Mitglieder haben automatisch «Bearbeiten». Viewer
**nicht** als Teammitglied aufnehmen, sondern der SharePoint-Site als
**Besucher** hinzufügen: Site → **Einstellungen (Zahnrad) →
Websiteberechtigungen → Mitglieder hinzufügen → Websitebesucher**.

Wer in SharePoint nur lesen darf, kann in der App nichts speichern — auch
dann nicht, wenn die App-Rolle etwas anderes sagt. Wer in SharePoint gar
keinen Zugriff hat, kann den Ordner nicht einmal öffnen.

## Teil 3b · Stammdaten schützen (`config/`)

**Warum:** Die App prüft die Rollen nur im Browser — und welche Entra-Rolle
als Admin gilt, steht in der `model.json` selbst (`auth.adminRole` usw.).
Wer die Datei ändern kann, kann also die Rollennamen leeren (dann ist jede
angemeldete Person Admin), den Empfänger der Sicherheits-Übergabe
(`handover.to`) auf sich umbiegen oder den Katalog verändern — direkt in
SharePoint, an der App vorbei. Reviewer brauchen «Bearbeiten» im
Datenordner (Projekte, Kommentare, `users.json`). Deshalb liegen die
Stammdaten im Unterordner `config/` mit eigenen Berechtigungen:

| Ordner | Admins | Reviewer | Viewer |
|---|---|---|---|
| `arch-review/` (Datenordner) | Bearbeiten | Bearbeiten | Lesen (Bearbeiten, wenn sie kommentieren sollen) |
| `arch-review/config/` (`model.json`) | **Bearbeiten** / Vollzugriff | **Lesen** | **Lesen** |

Alle brauchen mindestens «Lesen» auf `config/` — ohne die `model.json`
startet die App nicht.

**Einrichten** (neuer Ordner: `config/` hat die App schon angelegt, weiter
bei 3; bestehender Ordner mit `model.json` im Hauptordner: ab 1):

1. Im Datenordner **Neu → Ordner** → `config`.
2. `model.json` markieren → **Verschieben nach** → `config`. (Verschieben
   behält den Versionsverlauf.) Solange sie noch im Hauptordner liegt, liest
   die App sie dort und warnt im Admin; liegen beide Dateien da, gilt
   `config/model.json` — die alte im Hauptordner dann löschen. Während des
   Verschiebens sollte niemand im Admin-Modus arbeiten.
3. Ordner `config` → **… → Zugriff verwalten → Erweitert** (öffnet die
   klassische Berechtigungsseite) → **Vererbung von Berechtigungen beenden**.
4. Gruppe **Mitglieder** anhaken → **Berechtigungen bearbeiten** → nur
   **Lesen**. **Besucher** bleiben bei **Lesen**, **Besitzer** bei
   **Vollzugriff**. Bei einem Teams-Team heisst das: Admins sind
   **Besitzer** des Teams, Reviewer **Mitglieder**. Admins, die keine
   Besitzer sein sollen, einzeln mit **Bearbeiten** hinzufügen.
5. Unter **Zugriff verwalten → Links** prüfen, dass es auf `config/` bzw.
   der `model.json` keinen Freigabelink mit «Bearbeiten» gibt.
6. In der App: **Admin → Sicherheit (Stammdaten) → Erneut prüfen**. Grün
   heisst: Mindestens eine Gruppe, die im Datenordner schreiben darf, kann
   die `model.json` nur lesen. Die Liste «Schreibberechtigt auf der
   model.json» sollte nur Admins enthalten.
7. Gegenprobe mit einem Reviewer-Konto: `config/model.json` in SharePoint
   bearbeiten → muss scheitern.

**Was der Check in der App prüft:** Er liest über Microsoft Graph die
Berechtigungen des Datenordners und der `model.json` und vergleicht, wer
jeweils schreiben darf. Rot, wenn beide gleich sind (nichts eingeschränkt)
oder ein Bearbeitungslink für die ganze Organisation/anonym existiert; gelb,
wenn die Datei noch im Hauptordner liegt, eine alte Kopie herumliegt oder
jemand zwar den Datenordner, aber nicht die `model.json` sieht. Die
Berechtigungen lesen dürfen nur Besitzer/innen der Site — sonst meldet der
Check «nicht lesbar». Welche Gruppe in Entra welche App-Rolle hat, sieht
der Check nicht; die Zuordnung Besitzer = Admin bleibt Aufgabe des Admins.

**Echte Geheimnisse** (Passwörter, API-Keys, Client-Secrets, Webhook-URLs)
gehören weder in die `model.json` noch in den Ordner: Die App ist eine reine
Browser-App, alles was sie lädt, kann die angemeldete Person in den
Entwicklertools sehen. Tenant- und Client-ID sind keine Geheimnisse. Braucht
es später ein Secret, dann in einem Backend (z. B. Azure Function mit Key
Vault), nie im Browser.

## Teil 4 · Entra: Graph-Berechtigung für die App

In der App-Registrierung **Z9nAI Arch Review** → **API-Berechtigungen →
Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen** →
`Files.ReadWrite.All` suchen und anhaken → **Berechtigungen hinzufügen**.

Dann **Administratorzustimmung für ‹Tenant› erteilen** → Ja. (Delegiert
heisst: Die App kann nur auf Dateien zugreifen, die *die angemeldete Person
selbst* sehen darf — nie mehr.)

Ohne diese Zustimmung scheitert der erste Zugriff mit `AADSTS65001`.

**Optional, für @-Erwähnungen in Kommentaren:** zusätzlich die delegierte
Berechtigung `User.ReadBasic.All` hinzufügen (Name und E-Mail der Personen
im Tenant lesen — mehr nicht). Fehlt sie, zeigt die App beim ersten «@» ein
Hinweis-Popup und schlägt nur Personen vor, die in diesem Ordner schon
gearbeitet oder kommentiert haben (`users.json`). Ohne
Administratorzustimmung stimmt jede Person beim ersten «@» selbst zu
(Button «Berechtigung erteilen» im Popup).

**Optional, für Teams-Benachrichtigungen bei @-Erwähnungen:** zusätzlich die
delegierten Berechtigungen `Chat.Create` und `ChatMessage.Send` (dazu
`User.ReadBasic.All` von oben). Damit schickt die kommentierende Person der
erwähnten Person eine persönliche Chat-Nachricht — aus ihrem eigenen Konto,
die App braucht kein Dienstkonto. Einschalten im Admin unter
«Benachrichtigungen (Teams)». Fehlt die Berechtigung, bleibt die
Benachrichtigung als «ausstehend» am Kommentar stehen und die App zeigt
einmal pro Sitzung ein Popup.

## Teil 5 · In der App verbinden

1. App öffnen → **«SharePoint-Ordner verbinden»**.
2. **Beim allerersten Mal in diesem Browser:** am einfachsten den
   **Einrichtungs-Link** vom Admin öffnen
   (`…/arch-review/?setup=…`) — er enthält Anmeldung
   **und** SharePoint-Ordner: Link öffnen → Microsoft-Login → fertig, der
   Ordner ist verbunden. Die Einstellungen bleiben im Browser gespeichert
   (Mac, PC, jeder Browser gleich; nichts davon liegt im Repo oder
   Deployment). Den Einrichtungs-Link kann man auch in das Feld des
   Dialogs einfügen, statt ihn zu öffnen. Ohne Einrichtungs-Link: den
   **Ordner-Link** aus Teil 2 einfügen und — nur beim ersten Mal in diesem
   Browser — die **Anwendungs-ID (Client)** eintragen → **Anmelden und
   verbinden**. Die Verzeichnis-ID ermittelt die App aus der
   SharePoint-Adresse (`firma.sharepoint.com` → Tenant
   `firma.onmicrosoft.com`); klappt das nicht (z. B. umbenannter Tenant),
   fragt sie danach. Nach dem Microsoft-Login verbindet die App den Ordner
   automatisch.

Die App merkt sich den Ordner im Browser; beim nächsten Start verbindet sie
automatisch. Der lokale Ordner bleibt als Alternative bestehen (z. B. für
Tests mit `sample-data/`).

**Link weitergeben:** Wer mit einem SharePoint-Ordner verbunden ist, findet
oben rechts neben dem Ordnernamen **«Teilen»** — kopiert den
Einrichtungs-Link mit den Anmelde-IDs dieser Sitzung und dem aktuellen
Ordner. Per Teams-Nachricht verteilen, fertig; Empfänger öffnen ihn, melden
sich an und sind im Ordner. Zugriff erhält trotzdem nur, wer in SharePoint
berechtigt ist. Dasselbe gibt es für Admins unter **Admin → Anmeldung → Für
Benutzer → «Einrichtungs-Link kopieren»** (IDs aus der `config/model.json`,
sonst die der Sitzung). Rollen und die Login-Pflicht für lokale Ordner
stehen weiterhin in der `config/model.json`.

## Typische Probleme

| Symptom | Ursache / Lösung |
|---|---|
| `AADSTS65001` beim Verbinden | Teil 4: `Files.ReadWrite.All` fehlt oder keine Administratorzustimmung |
| Popup «Entra-Benutzersuche nicht verfügbar» beim «@» | Teil 4: `User.ReadBasic.All` fehlt (Admin) oder die Person hat noch nicht zugestimmt («Berechtigung erteilen») |
| Popup «Teams-Benachrichtigung nicht möglich» | Teil 4: `Chat.Create` / `ChatMessage.Send` fehlen (Admin) oder die Person hat noch nicht zugestimmt; der Kommentar ist gespeichert, die Nachricht geht später raus |
| «Link konnte nicht aufgelöst werden» | Link zeigt nicht auf einen Ordner, oder die Person hat keinen Zugriff auf die Site |
| Speichern schlägt fehl (403) | Person hat in SharePoint nur Lesen (Teil 3) |
| Admin: «config/model.json konnte nicht geschrieben werden» | Admin ist auf `config/` nicht Besitzer/Bearbeiten (Teil 3b, Schritt 4) |
| App startet nicht: «config/model.json konnte nicht gelesen werden (HTTP 403)» | Person hat auf `config/` gar keinen Zugriff — mindestens «Lesen» geben (Teil 3b) |
| Admin → Sicherheit: «Berechtigungen nicht lesbar» | Nur Site-Besitzer/innen dürfen Berechtigungen lesen — Admin als Besitzer eintragen |
| Konflikt-Meldung in der App | Jemand anderes hat dieselbe Projektdatei gleichzeitig gespeichert — neu laden oder überschreiben (ETag-Prüfung) |
| Testversion abgelaufen | SharePoint ist weg, Daten 30 Tage wiederherstellbar durch erneutes Lizenzieren |
