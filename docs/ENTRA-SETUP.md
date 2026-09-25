# Anmeldung über Microsoft Entra ID — Einrichtung Schritt für Schritt

Die App meldet Benutzer über **Microsoft Entra ID** (ehemals Azure AD) an —
mit MSAL im Browser (Authorization Code Flow + PKCE), ohne eigenen Server.

**Was die Anmeldung leistet — und was nicht:**

- ✅ Nur Personen aus dem eigenen Tenant (optional: nur zugewiesene Personen)
  können die App öffnen.
- ✅ Die angemeldete Person ist bekannt: Name in der Kopfleiste, Vorbelegung
  von «Prüfer/in» bei der Freigabe.
- ✅ Drei Zugriffsstufen über App-Rollen: **Admin** (alles inkl.
  Stammdaten), **Reviewer** (Reviews bearbeiten, Projekte anlegen,
  importieren/exportieren), **Viewer** (alles nur lesen, PDFs exportieren).
- ❌ Die Anmeldung schützt **nicht die Daten**: `config/model.json` und die
  Projektdateien liegen im geteilten Ordner — deren Berechtigung (SharePoint/
  Google Drive/Netzlaufwerk) entscheidet, wer lesen und schreiben darf. Die
  App hat kein Backend, das Zugriffe prüfen könnte. Weil auch die
  Rollennamen in der `model.json` stehen, dürfen nur Admins sie ändern
  können: eigener Ordner `config/` mit Schreibrecht nur für Admins —
  [SHAREPOINT-SETUP.md, Teil 3b](SHAREPOINT-SETUP.md#teil-3b--stammdaten-schützen-config).

Benötigt werden am Ende genau **zwei IDs** (keine Geheimnisse): die
**Verzeichnis-ID (Tenant)** und die **Anwendungs-ID (Client)**. Diese werden
in der App unter **Admin → Anmeldung (Microsoft Entra ID)** eingetragen und
landen in der `config/model.json` des geteilten Ordners — sie gelten damit für alle
Benutzer dieses Ordners.

---

## Teil A — App-Registrierung im eigenen Entra-Tenant

> Dafür braucht es im Tenant die Rolle **Anwendungsentwickler**
> (oder Cloudanwendungsadministrator / globaler Administrator). Wer die Rolle
> nicht hat, gibt diese Anleitung an die IT weiter — Teil A dauert ca. 10 Minuten.

### A1 · Registrierung anlegen

1. <https://entra.microsoft.com> öffnen → **Identität → Anwendungen →
   App-Registrierungen** → **Neue Registrierung**.
2. Ausfüllen:
   - **Name:** `Z9nAI Arch Review`
   - **Unterstützte Kontotypen:** *Nur Konten in diesem Organisationsverzeichnis
     (einzelner Mandant)*
   - **Umleitungs-URI:** Plattform **Single-Page-Webanwendung (SPA)**,
     URI `https://z9nai.github.io/arch-review/`
3. **Registrieren**.
4. Auf der Übersichtsseite notieren:
   - **Anwendungs-ID (Client)** → `clientId`
   - **Verzeichnis-ID (Mandant)** → `tenantId`

### A2 · Zweite Umleitungs-URI für die Entwicklung

**Authentifizierung** → unter *Single-Page-Webanwendung* **URI hinzufügen**:
`http://localhost:3001/arch-review/` → **Speichern**.

Wichtig: Beide URIs müssen unter der Plattform **SPA** stehen (nicht «Web»)
und exakt mit Schrägstrich am Ende — sonst lehnt Entra den Login mit
`AADSTS50011` (Redirect-URI stimmt nicht überein) ab. Implizite Gewährung
(«Zugriffstoken»/«ID-Token»-Häkchen) bleibt **aus** — PKCE braucht sie nicht.

### A3 · Berechtigungen (API-Berechtigungen)

Alle Berechtigungen sind **delegiert** (Microsoft Graph): Die App handelt
immer im Namen der angemeldeten Person und kann nie mehr als diese Person
selbst. Anwendungsberechtigungen (App-only), Client-Secrets oder Zertifikate
braucht sie nicht.

| Berechtigung | Wofür | Funktion in der App | Admin-Zustimmung | Wenn sie fehlt |
|---|---|---|---|---|
| `openid`, `profile`, `email` (in *User.Read* enthalten, Standard) | Anmeldung; Name, E-Mail und App-Rollen aus dem ID-Token | Login-Gate, Zugriffsstufe, Name oben rechts, Kürzel in Kommentaren, Vorbelegung «Prüfer/in» | nein | keine Anmeldung möglich |
| `Files.ReadWrite.All` | Dateien lesen/schreiben, die die Person in SharePoint ohnehin sieht | **SharePoint-Modus**: `config/model.json`, `projects/`, Sperren, Kommentare, Quellen, `users.json`; Admin: Berechtigungen von Ordner und `model.json` lesen (Sicherheitscheck) | empfohlen (laut Graph nicht zwingend; viele Tenants verbieten aber die Benutzerzustimmung → `AADSTS65001`) | nur lokaler Ordner möglich |
| `User.ReadBasic.All` | Name und E-Mail der Personen im Tenant lesen — mehr nicht | **@-Erwähnungen**: Entra-Suche beim Tippen von «@» in einem Kommentar | nein — jede Person stimmt beim ersten «@» selbst zu (Popup «Berechtigung erteilen») | «@» schlägt nur Personen vor, die im Ordner schon gearbeitet oder kommentiert haben (`users.json`); einmal pro Sitzung ein Hinweis-Popup |
| `Chat.Create`, `ChatMessage.Send` | 1:1-Chat mit einer Person anlegen, Nachricht darin senden — im Namen der Person | **Teams-Benachrichtigung** bei @-Erwähnung und bei Antworten auf den eigenen Kommentar (Admin → Benachrichtigungen) | nein — Zustimmung beim ersten Versand (Popup) | Kommentar bleibt gespeichert, Benachrichtigung bleibt «ausstehend» und wird nachgeholt, sobald die Berechtigung da ist |

Minimalausbau: nur *User.Read* (lokaler Ordner, keine Erwähnungssuche, kein
Teams). Vollausbau: alle fünf. Hinzufügen unter **API-Berechtigungen →
Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**;
danach optional **Administratorzustimmung für ‹Tenant› erteilen** — dann
sieht keine Person mehr ein Zustimmungs-Popup.

### A4 · App-Rollen (empfohlen)

**App-Rollen** → **App-Rolle erstellen**, dreimal (zulässige Mitgliedstypen
jeweils *Benutzer/Gruppen*, aktiviert):

| Anzeigename | Wert | Kurz |
|---|---|---|
| `Arch Review Admin` | `ArchReview.Admin` | alles, inkl. Admin-Modus (Katalog, Anmeldung, Übergabe, Benachrichtigungen, Briefpapier) |
| `Arch Review Reviewer` | `ArchReview.Reviewer` | Projekte anlegen, Reviews bearbeiten und freigeben, importieren, exportieren, kommentieren |
| `Arch Review Viewer` | `ArchReview.Viewer` | alles lesen, PDFs exportieren, kommentieren — sonst keine Änderungen |

Die **Werte** müssen exakt den Rollenfeldern im Admin-Abschnitt der App
entsprechen. Die höchste passende Rolle gewinnt. Regeln: Sind alle drei
Felder leer, ist jede angemeldete Person Admin; ist eine Reviewer-Rolle
gesetzt, erhalten Personen ohne passende Rolle **keinen Zugriff** (Meldung
«Keine Berechtigung»).

#### Was darf welche Rolle?

| Funktion | Admin | Reviewer | Viewer |
|---|:-:|:-:|:-:|
| Projektliste, Suche, Projekt öffnen | ✓ | ✓ | ✓ |
| Projekt anlegen, duplizieren, löschen; MS10-Import | ✓ | ✓ | – |
| Antworten, Bemerkungen, Kontrollpunkte bearbeiten; Meilenstein freigeben | ✓ | ✓ | – |
| Bearbeitungssperre halten / von anderen übernehmen | ✓ | ✓ | – |
| Offene Fragen exportieren (Mail-Text, PDF-Formular), Übergabetext, Review-PDF | ✓ | ✓ | ✓ |
| Antworten importieren (Text, PDF) | ✓ | ✓ | – |
| Quellen herunterladen / öffnen | ✓ | ✓ | ✓ |
| Quellen hochladen, bearbeiten, entfernen | ✓ | ✓ | – |
| Kommentare lesen, Übersicht, Schrittfolge | ✓ | ✓ | ✓ |
| Kommentieren, antworten, erledigen / wieder öffnen | ✓ | ✓ | ✓ ¹ |
| Kommentare löschen | alle | alle | nur eigene |
| @-Erwähnungen mit Entra-Suche | ✓ | ✓ | ✓ |
| Teams-Benachrichtigung auslösen (aus dem eigenen Konto) | ✓ | ✓ | ✓ |
| Admin-Modus: Themen, Fragen, Klassifikation, Kontrollpunkte, Anmeldung, Übergabe, Benachrichtigungen, Briefpapier | ✓ | – | – |
| **SharePoint-Berechtigung auf dem Ordner** (Teil 3 in SHAREPOINT-SETUP.md) | Bearbeiten | Bearbeiten | Lesen ¹ |
| **SharePoint-Berechtigung auf `config/`** (Teil 3b) | Bearbeiten | **Lesen** | Lesen |

¹ Kommentare liegen als Datei im Ordner (`projects/<slug>.comments.json`).
Eine Viewerin mit **Lesen** in SharePoint kann deshalb nicht kommentieren
(Speichern schlägt mit 403 fehl). Sollen Viewer kommentieren, brauchen sie in
SharePoint **Bearbeiten** — die App hält sie an der Oberfläche trotzdem auf
Nur-Lesen (Rolle), nur der Dateischutz gegen Umgehung entfällt dann. Beim
lokalen Ordner gilt sinngemäss das Schreibrecht des Dateisystems.

Welche Dateien die App im Namen welcher Rolle schreibt:

| Datei | Wer schreibt |
|---|---|
| `config/model.json` | Admin (Admin-Modus) — in SharePoint nur für Admins schreibbar (Teil 3b) |
| `projects/<slug>.json`, `projects/<slug>.lock.json`, `projects/<slug>/sources/*` | Admin, Reviewer |
| `projects/<slug>.comments.json` | alle, die kommentieren (auch Viewer, s. o.) |
| `users.json` | jede angemeldete Person beim Öffnen des Ordners (ohne Schreibrecht still übersprungen) |

### A5 · Wer darf die App benutzen?

**Identität → Anwendungen → Unternehmensanwendungen** → `Z9nAI Arch Review`:

1. **Eigenschaften** → **Zuweisung erforderlich?** auf **Ja** → Speichern.
   Damit kommen nur explizit zugewiesene Personen/Gruppen rein; auf **Nein**
   darf jede Person des Tenants.
2. **Benutzer und Gruppen** → **Benutzer/Gruppe hinzufügen** und je eine der
   drei Rollen wählen (Admin / Reviewer / Viewer).

   Tipp: Drei Sicherheitsgruppen anlegen (z. B. `ArchReview-Admins`,
   `ArchReview-Reviewers`, `ArchReview-Viewers`) und die Gruppen zuweisen —
   dann läuft die Pflege über die Gruppenmitgliedschaft. Die
   **Gruppenzuweisung braucht Entra ID P1** (in M365 Business Premium/E3
   enthalten); im kostenlosen Plan erscheint «Groups are not available for
   assignment due to your Active Directory plan level» — dann einzelne
   Benutzer zuweisen, funktional identisch.

### A6 · Testbenutzer (optional)

Zum Durchspielen der Stufen: **Identität → Benutzer → Neuer Benutzer**
(z. B. `viewer.test@<domäne>`, Anzeigename «Viewer Test», Kennwort
generieren und notieren — keine Lizenz nötig), dann in A5 mit der jeweiligen
Rolle zuweisen. Anmelden im **Inkognito-Fenster**, sonst greift das SSO des
eigenen Kontos. Beim ersten Login verlangt Microsoft eine Kennwortänderung
und je nach Tenant die MFA-Registrierung.

---

## Teil B — App konfigurieren

### B1 · Im Admin eintragen

App öffnen → geteilten Ordner wählen → **Admin** → Abschnitt
**Anmeldung (Microsoft Entra ID)**:

- **Verzeichnis-ID (Tenant)** und **Anwendungs-ID (Client)** einfügen (die
  Felder prüfen das GUID-Format; rot = ungültig).
- **Admin-/Reviewer-/Viewer-Rolle**: die **Werte** der App-Rollen aus A4
  (vorbelegt mit `ArchReview.Admin` / `ArchReview.Reviewer` /
  `ArchReview.Viewer`).
- **Anmeldung aktiv** anhaken — das geht erst, wenn beide IDs gültig sind.

Der Autosave schreibt die Einstellung als `auth` in die `config/model.json`; sie
gilt sofort (das Login-Gate erscheint direkt) und für alle, die diesen
Ordner verwenden. Der Abschnitt zeigt auch die Umleitungs-URIs an, die in
A1/A2 eingetragen sein müssen, und — wenn angemeldet — die Rollen aus dem
eigenen Token (hilfreich zum Prüfen von A4/A5).

### B2 · Testen

`http://localhost:3001/arch-review/` (oder die GitHub-Pages-URL) öffnen →
Login-Seite → **Mit Microsoft anmelden** → Login → zurück in der App: Name
oben rechts mit der Stufe (Admin / Reviewer / Viewer), bei Admin-Rolle
Schild-Symbol und **Admin**-Button. Viewer sehen alles ausgegraut, die
Statusleiste meldet «Nur lesen», nur die PDF-Exporte bleiben aktiv.

Stufen ohne Login ausprobieren (nur Dev-Server):
`?noauth&as=viewer` bzw. `?noauth&as=reviewer`.

Die IDs merkt sich der Browser lokal (auch ohne model.json) — für den
SharePoint-Modus verteilt der Admin sie per Einrichtungs-Link (Admin →
Anmeldung → Für Benutzer; enthält auch den Ordner).

### B3 · Ausgesperrt? (falsche IDs, Rolle fehlt)

- Entwicklung: `http://localhost:3001/arch-review/?noauth` (nur im
  Dev-Server) → Admin → Anmeldung deaktivieren oder IDs korrigieren.
- Produktion: in der `config/model.json` des geteilten Ordners `"auth": { "enabled":
  false, … }` setzen — als Besitzer/in der Site ist die Datei direkt zugänglich.

## Portal auf Englisch — die Stationen

Das Entra Admin Center (<https://entra.microsoft.com>) hat seit 2025 ein
flaches Menü: links **Entra ID**, darunter direkt **Enterprise apps** und
**App registrations**. Ältere Anleitungen (und die deutschen Pfade hier)
nennen noch «Identity → Applications → …» — gemeint ist dasselbe.

| Deutsch (diese Anleitung) | Englisch (Entra Admin Center) |
|---|---|
| Identität → Anwendungen → App-Registrierungen | **Entra ID → App registrations** (Reiter **All applications**, falls nicht unter *Owned applications*) |
| Übersicht: Anwendungs-ID (Client), Verzeichnis-ID (Mandant) | **Overview**: **Application (client) ID**, **Directory (tenant) ID** |
| Authentifizierung → Umleitungs-URI (Plattform SPA) | **Authentication → Add a platform → Single-page application** → Redirect URIs |
| API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen | **API permissions → Add a permission → Microsoft Graph → Delegated permissions** |
| Administratorzustimmung für ‹Tenant› erteilen | **Grant admin consent for ‹tenant›** |
| App-Rollen → App-Rolle erstellen | **App roles → Create app role** |
| Identität → Anwendungen → Unternehmensanwendungen | **Entra ID → Enterprise apps** — Filter **Application type = All applications** setzen, sonst fehlt die App oft; am sichersten über App registrations → Overview → Link **«Managed application in local directory»**. Achtung: Dort gibt es **kein** «API permissions» — Berechtigungen hinzufügen geht nur in der App registration |
| Eigenschaften → Zuweisung erforderlich? | **Properties → Assignment required?** |
| Benutzer und Gruppen → Benutzer/Gruppe hinzufügen → Rolle auswählen | **Users and groups → Add user/group → Select a role** |
| Identität → Benutzer → Neuer Benutzer | **Entra ID → Users → New user** |

## Typische Fehlermeldungen

| Meldung | Ursache / Lösung |
|---|---|
| `AADSTS50011` redirect URI mismatch | URI in A1/A2 stimmt nicht exakt (Schrägstrich, http/https, Plattform SPA statt Web). |
| `AADSTS90002` Tenant not found | `tenantId` falsch (Verzeichnis-ID, nicht Anwendungs-ID). |
| `AADSTS700016` Application not found | `clientId` falsch oder Registrierung in anderem Tenant. |
| `AADSTS50105` not assigned to a role | «Zuweisung erforderlich» ist an, Person ist nicht zugewiesen (A5). |
| `AADSTS65001` consent required | Eine Berechtigung aus A3 ist im Tenant nur mit Admin-Zustimmung erlaubt — unter *API-Berechtigungen → Administratorzustimmung erteilen*. |
| Popup «Entra-Benutzersuche nicht verfügbar» beim «@» | `User.ReadBasic.All` fehlt in A3 (Admin) oder die Person hat noch nicht zugestimmt («Berechtigung erteilen»). Erwähnungen gehen trotzdem, nur ohne Verzeichnissuche. |
| Popup «Teams-Benachrichtigung nicht möglich» | `Chat.Create` / `ChatMessage.Send` fehlen in A3 oder Zustimmung fehlt. Kommentar ist gespeichert, Nachricht bleibt «ausstehend» (Uhr-Symbol) und geht später raus. |
| Viewer kann nicht kommentieren (403) | SharePoint-Berechtigung «Lesen» — siehe Fussnote ¹ in A4. |
| Admin-Button fehlt trotz Rolle / falsche Stufe | Rolle in A5 der Person zugewiesen? Rollenfeld im Admin = **Wert** der Rolle (A4)? Einmal ab- und wieder anmelden (Rollen stehen im ID-Token). Der Admin-Abschnitt zeigt die Token-Rollen und die erkannte Stufe. |
| «Keine Berechtigung für diese App» | Angemeldet, aber keine der drei Rollen zugewiesen (A5). |
| «Tenant-ID/Client-ID sind keine gültigen IDs» | `auth` in der config/model.json von Hand unvollständig editiert — im Admin korrigieren (oder `enabled: false`). |

## Technische Notizen

- Bibliothek: `@azure/msal-browser` (mitgebundelt, eigener Lazy-Chunk; wird
  nur geladen, wenn die Anmeldung aktiv ist).
- Flow: `loginRedirect` → Entra → Redirect zurück auf die App-URL →
  `handleRedirectPromise`. Sitzung im `localStorage` des Browsers; **Abmelden**
  (Symbol oben rechts) ruft `logoutRedirect` auf.
- Aus dem ID-Token werden `name`, `preferred_username`, `roles` und die
  Objekt-ID (`localAccountId`, für den Teams-Chat) gelesen. Tokens gehen
  ausschliesslich an Microsoft Graph, nie an Dritte.
- Graph-Aufrufe (alle delegiert, nur wenn die Funktion genutzt wird):
  Dateien im SharePoint-Ordner (`/drives/…`), Benutzersuche
  (`/users?$search=…`, `/users/{mail}`), Teams-Chat (`POST /chats`,
  `POST /chats/{id}/messages`). Zusätzliche Scopes holt die App **still**
  (`acquireTokenSilent`); fehlt die Zustimmung, gibt es ein Popup mit
  «Berechtigung erteilen» statt eines überraschenden Redirects.
- Netzwerk: Die App spricht zur Laufzeit mit `login.microsoftonline.com`
  (Anmeldung) und `graph.microsoft.com` (SharePoint, Verzeichnis, Teams) —
  sonst mit niemandem.
