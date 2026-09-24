# SharePoint als gemeinsamer Ordner — Einrichtung (Testumgebung und Produktion)

Die App kann ihre Daten (`model.json`, `projects/*.json`) direkt in einer
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

Die App legt `model.json` und den Unterordner `projects/` beim ersten
Verbinden selbst an, falls sie fehlen.

## Teil 3 · Berechtigungen = Zugriffsstufen

SharePoint prüft serverseitig, wer lesen und schreiben darf — unabhängig von
den App-Rollen. Beides sollte zusammenpassen:

| App-Rolle (Entra) | SharePoint-Berechtigung auf der Site / dem Ordner |
|---|---|
| Admin | **Bearbeiten** (Mitglied/Besitzer) |
| Reviewer | **Bearbeiten** (Mitglied) |
| Viewer | **Lesen** (Besucher) |

Bei einem Teams-Team: Mitglieder haben automatisch «Bearbeiten». Viewer
**nicht** als Teammitglied aufnehmen, sondern der SharePoint-Site als
**Besucher** hinzufügen: Site → **Einstellungen (Zahnrad) →
Websiteberechtigungen → Mitglieder hinzufügen → Websitebesucher**.

Wer in SharePoint nur lesen darf, kann in der App nichts speichern — auch
dann nicht, wenn die App-Rolle etwas anderes sagt. Wer in SharePoint gar
keinen Zugriff hat, kann den Ordner nicht einmal öffnen.

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

## Teil 5 · In der App verbinden

1. App öffnen → **«SharePoint-Ordner verbinden»**.
2. **Beim allerersten Mal in diesem Browser:** am einfachsten den
   **Einrichtungs-Link** vom Admin öffnen
   (`…/arch-review/?tenant=…&client=…&folder=…`) — er enthält Anmeldung
   **und** SharePoint-Ordner: Link öffnen → Microsoft-Login → fertig, der
   Ordner ist verbunden. Die Einstellungen bleiben im Browser gespeichert
   (Mac, PC, jeder Browser gleich; nichts davon liegt im Repo oder
   Deployment). Ohne Link: im Dialog «Microsoft-Anmeldung einrichten» die
   beiden IDs eintragen → anmelden → Ordner-Link aus Teil 2 einfügen →
   **Verbinden**.

Die App merkt sich den Ordner im Browser; beim nächsten Start verbindet sie
automatisch. Der lokale Ordner bleibt als Alternative bestehen (z. B. für
Tests mit `sample-data/`).

**Für Admins:** Unter **Admin → Anmeldung → Für Benutzer** gibt es
**«Einrichtungs-Link kopieren»** — mit verbundenem SharePoint-Ordner enthält
der Link IDs und Ordner. Per Teams-Nachricht verteilen, fertig. Rollen und
die Login-Pflicht für lokale Ordner stehen weiterhin in der `model.json`.

## Typische Probleme

| Symptom | Ursache / Lösung |
|---|---|
| `AADSTS65001` beim Verbinden | Teil 4: `Files.ReadWrite.All` fehlt oder keine Administratorzustimmung |
| Popup «Entra-Benutzersuche nicht verfügbar» beim «@» | Teil 4: `User.ReadBasic.All` fehlt (Admin) oder die Person hat noch nicht zugestimmt («Berechtigung erteilen») |
| «Link konnte nicht aufgelöst werden» | Link zeigt nicht auf einen Ordner, oder die Person hat keinen Zugriff auf die Site |
| Speichern schlägt fehl (403) | Person hat in SharePoint nur Lesen (Teil 3) |
| Konflikt-Meldung in der App | Jemand anderes hat dieselbe Projektdatei gleichzeitig gespeichert — neu laden oder überschreiben (ETag-Prüfung) |
| Testversion abgelaufen | SharePoint ist weg, Daten 30 Tage wiederherstellbar durch erneutes Lizenzieren |
