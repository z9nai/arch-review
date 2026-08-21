# App-Registrierung «Z9nAI Arch Review» in Microsoft Entra ID

Anleitung für die Entra-Administration. Aufwand ca. 10–15 Minuten.
Benötigte Rolle im Tenant: **Anwendungsentwickler** oder
**Cloudanwendungsadministrator** (für Schritt 5 zusätzlich
**Benutzeradministrator** oder die Berechtigung, Benutzer der
Unternehmensanwendung zuzuweisen).

## Worum es geht

«Z9nAI Arch Review» ist eine reine Browser-Anwendung (Single-Page-App) für
die Architekturprüfung von Projekten. Sie soll Benutzer über Microsoft
Entra ID anmelden und anhand von **App-Rollen** drei Zugriffsstufen
unterscheiden.

Sicherheitsrelevante Eckdaten für die Beurteilung:

| Aspekt | Wert |
|---|---|
| Anwendungstyp | Single-Page-App (öffentlicher Client), Authorization Code Flow mit PKCE |
| Client-Secret / Zertifikat | **keines** (nicht erforderlich, nicht vorgesehen) |
| Benötigte Berechtigungen | Anmeldung: `openid`, `profile`, `email`; Dateizugriff: `Files.ReadWrite.All` (delegiert, Microsoft Graph) — dafür **Administratorzustimmung** erforderlich |
| Zugriff auf Unternehmensdaten | nur SharePoint-Dateien, auf die **die angemeldete Person selbst** Zugriff hat (delegiert); die App greift ausschliesslich auf den für sie eingerichteten Ordner zu |
| Verwendete Token-Inhalte | Anzeigename, E-Mail (UPN), App-Rollen |
| Kontotypen | nur dieser Tenant (einzelner Mandant) |
| Hosting | GitHub Pages (statische Dateien), kein eigener Server/Backend |

## Schritt 1 · App-Registrierung anlegen

**Microsoft Entra Admin Center** (<https://entra.microsoft.com>) →
**Identität → Anwendungen → App-Registrierungen → Neue Registrierung**

| Feld | Wert |
|---|---|
| Name | `Z9nAI Arch Review` |
| Unterstützte Kontotypen | **Nur Konten in diesem Organisationsverzeichnis (einzelner Mandant)** |
| Umleitungs-URI — Plattform | **Single-Page-Webanwendung (SPA)** |
| Umleitungs-URI — URI | `https://z9nai.github.io/arch-review/` |

→ **Registrieren**

## Schritt 2 · Zweite Umleitungs-URI

In der Registrierung: **Authentifizierung** → Abschnitt
*Single-Page-Webanwendung* → **URI hinzufügen**:

```
http://localhost:3001/arch-review/
```

→ **Speichern**

Hinweise:
- Beide URIs **exakt** so, inklusive Schrägstrich am Ende, und beide unter
  der Plattform **SPA** (nicht unter «Web»).
- Die Häkchen unter *Implizite Genehmigung und Hybridflows* (Zugriffstoken /
  ID-Token) bleiben **deaktiviert** — PKCE benötigt sie nicht.
- Die localhost-URI dient der Entwicklung und Fehlersuche; sie kann nach der
  Einführung entfernt werden.

## Schritt 3 · API-Berechtigungen

**API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph →
Delegierte Berechtigungen** → `Files.ReadWrite.All` anhaken →
**Berechtigungen hinzufügen**. Anschliessend **Administratorzustimmung für
‹Tenant› erteilen** → Ja.

Die Standardberechtigung *User.Read* kann bleiben (deckt `openid`, `profile`,
`email` ab). `Files.ReadWrite.All` ist **delegiert**: Die App kann nur
Dateien lesen/schreiben, die die angemeldete Person in SharePoint ohnehin
sehen bzw. bearbeiten darf. Anwendungsberechtigungen (App-only) werden
nicht benötigt und sollen nicht erteilt werden.

## Schritt 4 · App-Rollen anlegen

In der Registrierung: **App-Rollen → App-Rolle erstellen** — dreimal:

| Anzeigename | Zulässige Mitgliedstypen | Wert | Beschreibung |
|---|---|---|---|
| `Arch Review Admin` | Benutzer/Gruppen | `ArchReview.Admin` | Pflegt Themen, Fragen, Klassifikationen und die Anmeldeeinstellungen; alle Rechte |
| `Arch Review Reviewer` | Benutzer/Gruppen | `ArchReview.Reviewer` | Legt Projekte an, bearbeitet und gibt Reviews frei, importiert und exportiert |
| `Arch Review Viewer` | Benutzer/Gruppen | `ArchReview.Viewer` | Liest alles, kann PDFs exportieren; keine Änderungen |

Jeweils **«Möchten Sie diese App-Rolle aktivieren?» = Ja**.
Die Spalte **Wert** muss buchstabengetreu übernommen werden — die
Anwendung wertet genau diese Zeichenfolgen aus.

## Schritt 5 · Zugriff zuweisen

**Identität → Anwendungen → Unternehmensanwendungen → Z9nAI Arch Review**

1. **Eigenschaften** → **Zuweisung erforderlich?** = **Ja** → Speichern.
   Damit können nur zugewiesene Personen die App verwenden.
2. **Benutzer und Gruppen → Benutzer/Gruppe hinzufügen** → Personen bzw.
   Gruppen auswählen → **Rolle auswählen** (Admin / Reviewer / Viewer) →
   **Zuweisen**.

Empfehlung: drei Sicherheitsgruppen (z. B. `ArchReview-Admins`,
`ArchReview-Reviewers`, `ArchReview-Viewers`) mit je einer Rolle zuweisen;
die Pflege erfolgt dann über die Gruppenmitgliedschaft. (Gruppenzuweisung
setzt Entra ID P1 voraus; andernfalls einzelne Benutzer zuweisen.)

Eine Person kann mehrere Rollen haben — die höchste gilt.

## Schritt 6 · SharePoint-Ordner

Ein Ordner in einer SharePoint-Dokumentbibliothek (z. B. Teams-Team
«Architekturprüfung» → Dateien → Ordner `arch-review`). Berechtigungen auf
der Site: Admins und Reviewer **Bearbeiten**, Viewer **Lesen**. Den Link zum
Ordner bitte ebenfalls zurückmelden.

## Schritt 7 · Rückmeldung

Bitte aus der **Übersicht** der App-Registrierung zurückmelden:

- **Anwendungs-ID (Client):** `________-____-____-____-____________`
- **Verzeichnis-ID (Mandant):** `________-____-____-____-____________`

Beide IDs sind öffentliche Kennungen (sie erscheinen in jeder Anmelde-URL)
und keine Geheimnisse. Sie werden in der Anwendung hinterlegt; danach ist
die Anmeldung aktiv.

## Optional · Richtlinien

Die Anwendung erzwingt selbst keine Anmeldehäufigkeit oder MFA — das
geschieht zentral über die Tenant-Richtlinien (Sicherheitsstandards bzw.
Conditional Access) und gilt automatisch auch für diese App.

## Bei Problemen

| Meldung beim Anmelden | Ursache |
|---|---|
| `AADSTS50011` (redirect URI mismatch) | Umleitungs-URI weicht ab (Schrägstrich, http/https) oder steht unter «Web» statt «SPA» |
| `AADSTS50105` (not assigned to a role) | Zuweisung erforderlich ist aktiv, Person/Gruppe nicht zugewiesen (Schritt 5) |
| `AADSTS65001` (consent required) | Administratorzustimmung für `Files.ReadWrite.All` fehlt (Schritt 3) |
| Person hat in der App die falsche Stufe | Rolle in Schritt 5 prüfen; Rollen stehen im Token, daher einmal ab- und wieder anmelden |

Kontakt für Rückfragen: Pascal Mengelt (pascal.mengelt@z9nai.ch)
