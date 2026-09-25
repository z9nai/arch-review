# Einführung bei einer Firma — Checkliste

Vorlage für die Einführung bei einer neuen Firma; **DEMOCOMPANY** steht für
den Namen der Firma. Pro Firma eine Kopie **ausserhalb dieses öffentlichen
Repos** führen (Firmennamen, IDs und Ordner-Links gehören nicht hierher).

Checkliste für den Weg «eigene App-Registrierung im DEMOCOMPANY-Tenant»: In
Entra wird nur bei DEMOCOMPANY etwas eingerichtet, im z9nai-Tenant nichts.
Benutzer bekommen einen Einrichtungs-Link («Teilen» in der App) und müssen
keine IDs kennen. Reihenfolge einhalten — jeder Schritt setzt den
vorherigen voraus.

| # | Was | Wer | Wo beschrieben |
|---|---|---|---|
| 1 | Code committen und deployen | z9nai | unten |
| 2 | App-Registrierung, Rollen, SharePoint-Ordner | DEMOCOMPANY-IT | [ENTRA-ADMIN-ANLEITUNG.md](ENTRA-ADMIN-ANLEITUNG.md) |
| 3 | DEMOCOMPANY-Ordner in der App einrichten | DEMOCOMPANY-Admin der App | unten |
| 4 | Bestehende Ordner: `model.json` nach `config/` | z9nai / Admins | [SHAREPOINT-SETUP.md, Teil 3b](SHAREPOINT-SETUP.md) |
| 5 | Testen | z9nai / DEMOCOMPANY-Admin | unten |
| 6 | Benutzer informieren | DEMOCOMPANY-Admin der App | unten |

---

## 1 · Code committen und deployen

- [ ] `npm run build` läuft fehlerfrei
- [ ] Commit auf `main` pushen — der Workflow *Deploy to GitHub Pages*
      veröffentlicht automatisch
- [ ] Nach 1–2 Minuten `https://z9nai.github.io/arch-review/` neu laden und
      prüfen: «SharePoint-Ordner verbinden» fragt zuerst nach dem Link;
      oben rechts gibt es bei verbundenem SharePoint-Ordner «Teilen»

## 2 · DEMOCOMPANY-IT: App-Registrierung, Rollen, SharePoint

- [ ] [ENTRA-ADMIN-ANLEITUNG.md](ENTRA-ADMIN-ANLEITUNG.md) an die
      DEMOCOMPANY-IT senden
- [ ] Schritt 1–2: Registrierung «Z9nAI Arch Review» (einzelner Mandant),
      Umleitungs-URIs (SPA) `https://z9nai.github.io/arch-review/` und
      `http://localhost:3001/arch-review/`
- [ ] Schritt 3: API-Berechtigungen (delegiert) und
      Administratorzustimmung — mindestens `Files.ReadWrite.All`; mit
      DEMOCOMPANY klären, ob auch `User.ReadBasic.All` (Personensuche beim «@»)
      und `Chat.Create` + `ChatMessage.Send` (Teams-Nachrichten) gewünscht
      sind
- [ ] Schritt 4–5: App-Rollen `ArchReview.Admin` / `.Reviewer` /
      `.Viewer`, «Zuweisung erforderlich» = Ja, Personen bzw. Gruppen
      zuweisen
- [ ] Schritt 6: SharePoint-Ordner inkl. Unterordner `config/` mit eigenen
      Berechtigungen (nur Admins bearbeiten)
- [ ] Schritt 7: Rückmeldung erhalten — **Anwendungs-ID**,
      **Verzeichnis-ID**, **Link zum SharePoint-Ordner**

## 3 · DEMOCOMPANY-Ordner in der App einrichten

Durch eine Person mit der Rolle `ArchReview.Admin` im DEMOCOMPANY-Tenant, in
einem Browser, der noch keine anderen IDs kennt (am einfachsten ein
privates Fenster):

- [ ] App öffnen → **SharePoint-Ordner verbinden** → Ordner-Link von
      DEMOCOMPANY einfügen → **Anwendungs-ID** von DEMOCOMPANY eintragen → **Anmelden
      und verbinden**. (Findet die App die Verzeichnis-ID nicht aus der
      SharePoint-Adresse, zeigt sie ein Feld dafür → Verzeichnis-ID von
      DEMOCOMPANY eintragen.)
- [ ] Nach dem Login ist der Ordner verbunden; fehlen `config/model.json`
      und `projects/`, legt die App sie an
- [ ] Admin → **Anmeldung**: Verzeichnis-ID und Anwendungs-ID von **DEMOCOMPANY**
      (nicht die von z9nai!), Rollenfelder `ArchReview.Admin` /
      `ArchReview.Reviewer` / `ArchReview.Viewer`. Die App übernimmt die IDs
      beim Verbinden aus der `model.json` — stehen dort falsche, schaltet
      sie auf die falsche Registrierung um.
- [ ] Admin → **Sicherheit (Stammdaten)** → «Erneut prüfen» → **grün**
      (sonst `config/` nach Teil 3b einrichten)

Vorab prüfen, ob die Verzeichnis-ID von DEMOCOMPANY automatisch gefunden wird:
im Browser
`https://login.microsoftonline.com/<präfix>.onmicrosoft.com/v2.0/.well-known/openid-configuration`
öffnen, wobei `<präfix>` der Teil vor `.sharepoint.com` in der
SharePoint-Adresse von DEMOCOMPANY ist. Kommt JSON mit `issuer`, klappt es;
kommt `AADSTS90002`, fragt der Dialog einmal nach der Verzeichnis-ID. Für
Benutzer spielt das keine Rolle — der Einrichtungs-Link enthält beide IDs.

## 4 · Bestehende Ordner: `model.json` nach `config/`

Für **jeden** Datenordner (Test- und Produktivordner, lokale
Sync-Ordner …), Anleitung: [SHAREPOINT-SETUP.md, Teil 3b](SHAREPOINT-SETUP.md):

- [ ] Ordner `config` anlegen, `model.json` hineinverschieben (niemand
      arbeitet währenddessen im Admin-Modus)
- [ ] Auf `config`: Vererbung beenden → Mitglieder **Lesen**, Besucher
      **Lesen**, Besitzer **Vollzugriff**
- [ ] Keine Freigabelinks mit «Bearbeiten» auf `config/`
- [ ] App → Admin → **Sicherheit (Stammdaten)** → **grün**; unter
      «Berechtigungen im Detail» kontrollieren, dass die Gruppen richtig
      erscheinen (erster Test dieser Prüfung gegen echtes SharePoint)
- [ ] Lokale Ordner: `model.json` ebenfalls nach `config/` verschieben

## 5 · Testen

- [ ] Im verbundenen DEMOCOMPANY-Ordner oben rechts **«Teilen»** → Link
      kopieren
- [ ] Privates Fenster → Link öffnen → Microsoft-Login mit einem
      **Reviewer**-Testkonto → Ordner ist ohne weiteren Schritt verbunden,
      Stufe «Reviewer», kein Admin-Button
- [ ] Gegenprobe Reviewer: `config/model.json` in SharePoint bearbeiten →
      muss scheitern
- [ ] Mit einem **Viewer**-Konto: alles nur lesbar, PDF-Export geht
- [ ] Falls Teams/Personensuche erteilt: Kommentar mit «@»-Erwähnung →
      Personensuche und Teams-Nachricht kommen an

## 6 · Benutzer informieren

- [ ] Einrichtungs-Link aus «Teilen» (oder Admin → Anmeldung →
      «Einrichtungs-Link kopieren») per Teams/Mail verteilen

Ablauf für Benutzer: Link öffnen → mit dem DEMOCOMPANY-Konto anmelden → fertig.
Beim nächsten Mal genügt `https://z9nai.github.io/arch-review/` — die App
verbindet den Ordner automatisch.

---

## Später / optional

- [ ] `http://localhost:3001/arch-review/` als Umleitungs-URI bei DEMOCOMPANY
      entfernen, wenn dort nicht entwickelt wird
- [ ] Alte `model.json` im Hauptordner löschen, sobald `config/` überall
      läuft (die App meldet Reste im Admin)
