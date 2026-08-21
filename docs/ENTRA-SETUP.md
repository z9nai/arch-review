# Anmeldung über Microsoft Entra ID (DEMOCOMPANY) — Einrichtung Schritt für Schritt

Die App meldet Benutzer über **Microsoft Entra ID** (ehemals Azure AD) an —
mit MSAL im Browser (Authorization Code Flow + PKCE), ohne eigenen Server.

**Was die Anmeldung leistet — und was nicht:**

- ✅ Nur Personen aus dem DEMOCOMPANY-Tenant (optional: nur zugewiesene Personen)
  können die App öffnen.
- ✅ Die angemeldete Person ist bekannt: Name in der Kopfleiste, Vorbelegung
  von «Prüfer/in» bei der Freigabe.
- ✅ Drei Zugriffsstufen über App-Rollen: **Admin** (alles inkl.
  Stammdaten), **Reviewer** (Reviews bearbeiten, Projekte anlegen,
  importieren/exportieren), **Viewer** (alles nur lesen, PDFs exportieren).
- ❌ Die Anmeldung schützt **nicht die Daten**: `model.json` und die
  Projektdateien liegen im geteilten Ordner — deren Berechtigung (SharePoint/
  Google Drive/Netzlaufwerk) entscheidet, wer lesen und schreiben darf. Die
  App hat kein Backend, das Zugriffe prüfen könnte.

Benötigt werden am Ende genau **zwei IDs** (keine Geheimnisse): die
**Verzeichnis-ID (Tenant)** und die **Anwendungs-ID (Client)**. Diese werden
in der App unter **Admin → Anmeldung (Microsoft Entra ID)** eingetragen und
landen in der `model.json` des geteilten Ordners — sie gelten damit für alle
Benutzer dieses Ordners.

---

## Teil A — App-Registrierung im Entra-Tenant von DEMOCOMPANY

> Dafür braucht es im DEMOCOMPANY-Tenant die Rolle **Anwendungsentwickler**
> (oder Cloudanwendungsadministrator / globaler Administrator). Wer die Rolle
> nicht hat, gibt diese Anleitung an die IT weiter — Teil A dauert ca. 10 Minuten.

### A1 · Registrierung anlegen

1. <https://entra.microsoft.com> öffnen → **Identität → Anwendungen →
   App-Registrierungen** → **Neue Registrierung**.
2. Ausfüllen:
   - **Name:** `Z9nAI Arch Review`
   - **Unterstützte Kontotypen:** *Nur Konten in diesem Organisationsverzeichnis
     (DEMOCOMPANY – einzelner Mandant)*
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

### A3 · Berechtigungen

**API-Berechtigungen**: Standardmässig steht dort *Microsoft Graph →
User.Read*. Die App braucht nur `openid`, `profile`, `email` — das ist in
*User.Read* enthalten und verlangt keine Administratorzustimmung. Nichts
weiter nötig. (Wer es minimal mag, kann *User.Read* entfernen und unter
*Berechtigung hinzufügen → Microsoft Graph → Delegiert* nur `openid`,
`profile`, `email` wählen.)

### A4 · App-Rollen (empfohlen)

**App-Rollen** → **App-Rolle erstellen**, dreimal (zulässige Mitgliedstypen
jeweils *Benutzer/Gruppen*, aktiviert):

| Anzeigename | Wert | Darf |
|---|---|---|
| `Arch Review Admin` | `ArchReview.Admin` | alles, inkl. Admin-Modus (Themen, Fragen, Klassifikation, Anmeldung) |
| `Arch Review Reviewer` | `ArchReview.Reviewer` | Projekte anlegen, Reviews bearbeiten und freigeben, importieren, exportieren |
| `Arch Review Viewer` | `ArchReview.Viewer` | alles nur lesen, PDFs exportieren (Review-PDF, Offene-Fragen-Formular) |

Die **Werte** müssen exakt den Rollenfeldern im Admin-Abschnitt der App
entsprechen. Die höchste passende Rolle gewinnt. Regeln: Sind alle drei
Felder leer, ist jede angemeldete Person Admin; ist eine Reviewer-Rolle
gesetzt, erhalten Personen ohne passende Rolle **keinen Zugriff** (Meldung
«Keine Berechtigung»).

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

Der Autosave schreibt die Einstellung als `auth` in die `model.json`; sie
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
- Produktion: in der `model.json` des geteilten Ordners `"auth": { "enabled":
  false, … }` setzen — die Datei ist ja direkt zugänglich.

## Typische Fehlermeldungen

| Meldung | Ursache / Lösung |
|---|---|
| `AADSTS50011` redirect URI mismatch | URI in A1/A2 stimmt nicht exakt (Schrägstrich, http/https, Plattform SPA statt Web). |
| `AADSTS90002` Tenant not found | `tenantId` falsch (Verzeichnis-ID, nicht Anwendungs-ID). |
| `AADSTS700016` Application not found | `clientId` falsch oder Registrierung in anderem Tenant. |
| `AADSTS50105` not assigned to a role | «Zuweisung erforderlich» ist an, Person ist nicht zugewiesen (A5). |
| `AADSTS65001` consent required | Es wurde eine Berechtigung mit Admin-Zustimmung hinzugefügt — entfernen oder unter *API-Berechtigungen → Administratorzustimmung erteilen*. |
| Admin-Button fehlt trotz Rolle / falsche Stufe | Rolle in A5 der Person zugewiesen? Rollenfeld im Admin = **Wert** der Rolle (A4)? Einmal ab- und wieder anmelden (Rollen stehen im ID-Token). Der Admin-Abschnitt zeigt die Token-Rollen und die erkannte Stufe. |
| «Keine Berechtigung für diese App» | Angemeldet, aber keine der drei Rollen zugewiesen (A5). |
| «Tenant-ID/Client-ID sind keine gültigen IDs» | `auth` in der model.json von Hand unvollständig editiert — im Admin korrigieren (oder `enabled: false`). |

## Technische Notizen

- Bibliothek: `@azure/msal-browser` (mitgebundelt, eigener Lazy-Chunk; wird
  nur geladen, wenn die Anmeldung aktiv ist).
- Flow: `loginRedirect` → Entra → Redirect zurück auf die App-URL →
  `handleRedirectPromise`. Sitzung im `localStorage` des Browsers; **Abmelden**
  (Symbol oben rechts) ruft `logoutRedirect` auf.
- Gelesen werden nur ID-Token-Claims: `name`, `preferred_username`, `roles`.
  Es werden keine Graph-Aufrufe gemacht und keine Tokens an Dritte gesendet.
- Netzwerk: Die App spricht zur Laufzeit ausschliesslich mit
  `login.microsoftonline.com` (Anmeldung) — sonst weiterhin mit niemandem.
