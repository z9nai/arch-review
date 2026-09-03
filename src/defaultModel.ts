import { Model } from './types';

// Standard-Katalog: wird als model.json angelegt, wenn die Datei im
// gewählten Ordner fehlt. Dient auch als Fallback, wenn eine bestehende
// model.json (noch) keine Fragen enthält.

export const DEFAULT_MODEL: Model = {
  "version": 3,
  "classifications": [
    {
      "id": "nicht-relevant",
      "label": "nicht relevant"
    },
    {
      "id": "relevant",
      "label": "relevant"
    },
    {
      "id": "wegweisend",
      "label": "wegweisend"
    }
  ],
  "themes": [
    {
      "id": "data-classification",
      "title": "Datenklassifikation",
      "infoMd": "# Datenklassifikation\n\n## Zweck\n\nStuft die Daten eines Vorhabens ein (an SCHUBAN angelehnt, aber eigene DEMOCOMPANY-Skala) und leitet daraus die anzuwendenden Datenhaltungsvorgaben ab. Die Einstufung ist Grundlage für alle Fragen im Thema Datenhaltung — sie entscheidet, welche Schutzklasse (K0–K4) gilt.\n\n## Schutzklassen\n\n| Klasse | Bedeutung |\n|---|---|\n| K0 Öffentlich | Zur Veröffentlichung bestimmt oder bereits öffentlich |\n| K1 Intern | Intern bestimmt, ohne Personen- oder Kundenbezug |\n| K2 Vertraulich | Daten von Kunden oder Mitarbeitenden ohne besondere Brisanz |\n| K3 Hochvertraulich | Inhalte, deren Offenlegung den Betroffenen ernsthaft schadet |\n| K4 Hochschutz | Daten, mit denen sich unmittelbar handeln lässt |\n\nDer Unterschied zwischen K0 und K1 liegt in der **Bestimmung**, nicht im Schaden. Ein zweckgebundener Datenausschnitt kann tiefer eingestuft werden als der vollständige, führende Bestand — massgebend sind Inhalt und Rolle im Systemverbund, nicht die Zahl der Betroffenen.\n\n## Vorgaben\n\n- Schutzbedarfsanalyse durchführen\n- Einstufung dokumentieren\n- Ableitung der Datenhaltungsvorgaben → Thema Datenhaltung\n"
    },
    {
      "id": "data-storage",
      "title": "Datenhaltung",
      "infoMd": "# Datenhaltung\n\n## Zweck\n\nDiese Übersicht legt fest, wo Daten je Schutzklasse gehalten werden dürfen und wo deren Backups liegen dürfen. Sie dient dem Nachschlagen. Das Prüfformular ist ein eigenes Dokument («Prüfformular Datenhaltung») und wird je Projekt ausgefüllt.\n\nEs gilt für neue oder geänderte Datenhaltungen in Projekten, Applikationen, Plattformen, Cloud- und SaaS-Lösungen, Datenbanken, Dateiablagen, Reporting-Umgebungen, Exporten, Caches und Backups.\n\nZur Datenhaltung gehören auch Bestände, an die man zuerst nicht denkt:\n\n- Reporting- und Auswertungsbestände\n- Logs und Monitoringdaten, sofern sie Personendaten, Tokens oder Secrets enthalten\n- persistente Caches, die Daten über die Verarbeitung hinaus behalten\n- prozessual vorgesehene Exporte, etwa ein wiederkehrender Auszug in eine andere Umgebung\n- Testumgebungen mit Produktivdaten\n- Backups und Snapshots\n\n**Keine** Datenhaltung ist die blosse Möglichkeit, Daten zu exportieren. Ein Export zählt erst, wenn der Prozess ihn vorsieht, er regelmässig entsteht oder das Ergebnis abgelegt wird. Ebenso wenig zählen die reine Übertragung und die reine Anzeige ohne Speicherung.\n\nNicht Gegenstand: Löschfristen und Aufbewahrungspflichten, Berechtigungskonzepte, Datenschutzfreigaben, Security-Konzept, Betriebs- und Wiederherstellungskonzepte.\n\n## Schutzklassen\n\nSiehe Thema Datenklassifikation, Abschnitt «Schutzklassen» — hier nur referenziert, nicht mehr dupliziert.\n\n## Grundprinzipien\n\n- Massgebend ist der **Inhalt** der Datenhaltung, weder der Name der Applikation noch die Personengruppe.\n- Die **höchste zutreffende Klasse** gilt für die gesamte Datenhaltung.\n- Liegt die Datenhaltung an mehreren Orten, gilt der **strengste Fall**.\n- Kopien, Exporte, Reporting-Bestände, Caches, Backups und Restore-Ziele **übernehmen die Klasse** der enthaltenen Daten.\n- **Unklarheit ist kein zulässiges Ergebnis**: Fehlen Angaben, lautet das Ergebnis «nicht beurteilbar», nicht «in Ordnung».\n- Labels, DLP, Verschlüsselung und Monitoring unterstützen, ersetzen aber weder Einstufung noch zulässigen Ort.\n\n## Vorgaben je Schutzklasse\n\nGrundlage für die Felder R1 bis R3 im Prüfformular. Die Anforderungen sind kumulativ.\n\n| Klasse | Zulässige Datenhaltung | Logs und Monitoring | Kopien und Exporte |\n|---|---|---|---|\n| K0 | Kein zwingender Datenraum | Normales Betriebsmonitoring | Keine Einschränkung |\n| K1 | Intern oder Cloud/SaaS, Schweiz als Standard | Normales Betriebsmonitoring | Keine Ablage in persönlichen oder unkontrollierten Bereichen |\n| K2 | Schweiz erforderlich, Cloud/SaaS Schweiz möglich | Monitoring erforderlich, keine Nutzdaten, Secrets oder Tokens in Logs | Nur zweckgebunden |\n| K3 | Schweiz und restriktiv kontrollierter Ort | Zusätzlich nachvollziehbare Protokollierung | Nur wenn fachlich notwendig |\n| K4 | Private Cloud oder dedizierter Hochschutz-Ort Schweiz | Zusätzlich auditierbare Protokollierung | Grundsätzlich zu vermeiden |\n\nFür K0 keine verbindliche Ortsvorgabe. Für K1 gilt die Schweiz als Standard; eine Abweichung vom Standardort allein ist keine Condition.\n\n## Abweichungen und Risikoakzeptanz\n\nDie Architektur bewertet die Abweichung, die Risikoakzeptanz erfolgt durch die zuständige Entscheidungsebene.\n\n| Situation | Erwartete Behandlung |\n|---|---|\n| Abweichung bei K2 oder K3 | Risikoanalyse und dokumentierte Risikoakzeptanz |\n| Abweichung bei K4 | Grundsätzlich nicht zulässig, es braucht eine explizite Ausnahmeentscheidung |\n| Ort nicht belegbar oder Zugriff aus dem Ausland unklar | Nicht beurteilbar, bis ein Nachweis vorliegt |\n"
    },
    {
      "id": "integration-application",
      "title": "Integrations- und Applikationsarchitektur",
      "infoMd": "# Integrations- und Applikationsarchitektur\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft, ob neue oder geänderte Schnittstellen und Applikationskomponenten den etablierten Integrationsmustern folgen und sauber gegen den bestehenden Applikationsbestand abgegrenzt sind.\n\n## Vorgaben\n\n- Kontextdiagramm als Lieferobjekt (Architektur, 2 PT)\n- Einhaltung der Integrationsmuster\n- Abgrenzung zu bestehenden Applikationen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "cloud-infrastructure",
      "title": "Cloud- und Infrastrukturarchitektur",
      "infoMd": "# Cloud- und Infrastrukturarchitektur\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft die Wahl der Zielumgebung und Plattform sowie die Einhaltung der Infrastrukturvorgaben, inklusive der damit verbundenen Betriebsaspekte.\n\n## Vorgaben\n\n- Zielumgebung und Plattformwahl\n- Infrastrukturvorgaben\n- Betriebsaspekte der Infrastruktur\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "security-compliance",
      "title": "Security & Compliance",
      "infoMd": "# Security & Compliance\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nWird nicht von der Architekturprüfung selbst erstellt oder inhaltlich beurteilt, sondern an die zuständige Fachstelle übergeben. Hier wird nur die Übergabe dokumentiert und das Ergebnis der externen Prüfung entgegengenommen.\n\n## Vorgaben\n\n- Übergabe an die zuständige Stelle\n- Ergebnis der externen Prüfung entgegennehmen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "idm-iam",
      "title": "IdM / IAM",
      "infoMd": "# IdM / IAM\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft Rollen- und Berechtigungskonzept, Anbindung an die zentralen IdM/IAM-Dienste sowie den Umgang mit privilegierten Zugriffen.\n\n## Vorgaben\n\n- Rollen und Berechtigungen\n- Anbindung an zentrale IdM/IAM-Dienste\n- Privilegierte Zugriffe\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "operations",
      "title": "Betriebsarchitektur",
      "infoMd": "# Betriebsarchitektur\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft betriebsnah, ob die Lösung organisatorisch und prozessual betriebsbereit ist: Betriebsorganisation, Supportprozesse sowie Backup, Monitoring und Alarmierung.\n\n## Vorgaben\n\n- Betriebsorganisation\n- Betriebshandbuch und Supportprozesse\n- Backup, Monitoring, Alarmierung\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "documentation",
      "title": "Dokumentation",
      "infoMd": "# Dokumentation\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft, ob die Architektur- und Lösungsdokumentation zum Projektabschluss aktuell ist und ob Architekturentscheide nachvollziehbar begründet sind.\n\n## Vorgaben\n\n- Aktualität der Dokumentation\n- Nachvollziehbarkeit der Architekturentscheide\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "technical-debt",
      "title": "Technische Schulden / Risiken / Conditions",
      "infoMd": "# Technische Schulden / Risiken / Conditions\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nHält am Projektende technische Schulden, Risiken und Conditions fest, inklusive einer groben Aufwandschätzung zur Behebung (Low/Medium/High), zur Weiterverfolgung im OnePager.\n\n## Vorgaben\n\n- Technische Schulden erfassen\n- Budget zur Behebung (Low / Med / High)\n- Risiken und Conditions im OnePager nachführen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    }
  ],
  "questions": [
    {
      "id": "qk9oegv9j4j",
      "text": "Ist für alle neuen Datenspeicher eine Datenklassifizierung inkl. CID-Relevanz dokumentiert?",
      "milestone": "M20",
      "themeId": "data-classification",
      "hint": "Auch Kopien/Repliken ausserhalb des Kernsystems zählen als eigener Datenspeicher. Betrifft insb. Read-Replicas/Caches (z.B. MongoDB-Golden-Record ohne Fallback auf den Core) - dort ist Datenverlust nicht durch das Kernsystem abgesichert."
    },
    {
      "id": "q9a3zestv5p",
      "text": "Ist die finale Zielarchitektur dokumentiert und freigegeben?",
      "milestone": "M20",
      "themeId": "integration-application",
      "hint": "Zielarchitektur umfasst alle Integrationspunkte, Datenflüsse und Abhängigkeiten zu Drittsystemen; Freigabe durch alle Beteiligten (Betreiber, Hersteller, Auftraggeber). Insb. relevant, wenn der Betreiber (nicht der Auftraggeber) die finale Architektur definiert - dann muss der Freigabeprozess/das Review explizit geregelt sein."
    },
    {
      "id": "qttvv4euyry",
      "text": "Liegt ein Threat Model für die neue Komponente/den neuen Service vor und deckt es alle neuen Trust-Boundaries ab?",
      "milestone": "M20",
      "themeId": "security-compliance",
      "hint": "Beispiel für eine neue Trust-Boundary: neue externe Integrationen. Falls das Threat Model vom Betreiber als Projektleistung geliefert wird: Zeitpunkt und Scope explizit prüfen, nicht als gegeben annehmen."
    },
    {
      "id": "qpzx51ivonp",
      "text": "Existiert ein getestetes Backup-/DR-Konzept, das von den Fachbereichen als ausreichend akzeptiert wird?",
      "milestone": "M40",
      "themeId": "operations",
      "hint": "Konzept muss RPO/RTO-Werte je Datenklasse definieren. Nicht nur nach Rahmenwerten des Herstellers fragen ('als Hilfestellung'), sondern nach dem konkreten, vom Betreiber gebauten und getesteten Konzept."
    },
    {
      "id": "qx7q7pxw95o",
      "text": "Ist das Identity-/Access-Management-Konzept beschrieben?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "hint": "Inkl. Federation zu externen Identity Providern und Zuständigkeit für deren Anbindung. Insbesondere prüfen, wer welchen Teil der Kette (externer IdP -> Federation Broker -> Applikation) verantwortet und ob das dokumentiert ist, nicht nur architektonisch plausibel."
    },
    {
      "id": "SC1",
      "text": "Wurde das Vorhaben der zuständigen Stelle für Security & Compliance übergeben?",
      "milestone": "M20",
      "themeId": "security-compliance",
      "hint": "Dieses Thema wird extern erstellt und geprüft.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "S1",
      "text": "Speichern wir irgendwo Daten neu?",
      "milestone": "M10",
      "themeId": "data-storage",
      "hint": "Was alles als Datenhaltung zählt, steht in der «Datenhaltung» (Info-Icon), Abschnitt Zweck."
    },
    {
      "id": "S2",
      "text": "Kopieren wir Daten an einen Ort, an dem sie heute nicht liegen?",
      "milestone": "M10",
      "themeId": "data-storage",
      "hint": "Dass ein System einen Export-Knopf hat, zählt nicht."
    },
    {
      "id": "C1",
      "text": "Werden neue Cloud-Dienste oder Plattformen eingesetzt?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure"
    },
    {
      "id": "C4",
      "text": "Kommen (neu oder in verstärktem Umfang) Hyperscaler-Dienste zum Einsatz?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure",
      "hint": "Beispiele: AWS, Azure, GCP. Eigenständiges Gate, unabhängig von C1 — auch relevant, wenn ein bereits bestehender Hyperscaler-Bezug ausgeweitet wird und dies für sich allein evtl. nicht als «neuer» Dienst im engeren Sinn von C1 gelesen würde. Hyperscaler-Nutzung ist regulatorisch (FINMA-Outsourcing-Vorgaben, Datenresidenz, Sub-Outsourcing-Ketten) besonders prüfrelevant und wird darum unabhängig erfasst. Bei Ja: Cloud-Art in C2 entsprechend als Public/Multi-Tenant oder Hybrid einstufen."
    },
    {
      "id": "C2",
      "text": "Private Cloud oder Public/Multi-Tenant Cloud?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure",
      "kind": "choice",
      "options": [
        "Private Cloud (dedizierter Betrieb, z. B. Swisscom)",
        "Public/Multi-Tenant Cloud (Hyperscaler, z. B. AWS, Azure, GCP)",
        "Hybrid / gemischt"
      ],
      "hint": "Private Cloud = dedizierter Betrieb (z. B. Swisscom). Public/Multi-Tenant Cloud = Hyperscaler (z. B. AWS, Azure, GCP). Nur relevant, wenn C1 = Ja. Bei Public/Multi-Tenant Cloud sind Datenresidenz, Shared-Responsibility-Modell und ggf. Bankkundengeheimnis-/Outsourcing-Vorgaben (FINMA-Rundschreiben) besonders zu prüfen; bei Private Cloud primär die vertragliche/betriebliche Kontrolle über die Plattform. Fliesst nicht in die Ja/Nein-Relevanzableitung ein (nur C1 ist Gate-Frage) — dient der direkten Sichtbarkeit der Cloud-Art im M10."
    },
    {
      "id": "C3",
      "text": "Ist der Betrieb der Infrastruktur (Monitoring, Patching) geklärt?",
      "milestone": "M40",
      "themeId": "cloud-infrastructure",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "I1",
      "text": "Entstehen neue Schnittstellen zu bestehenden Systemen?",
      "milestone": "M10",
      "themeId": "integration-application"
    },
    {
      "id": "I2",
      "text": "Werden bestehende Schnittstellen zu anderen Systemen wesentlich geändert?",
      "milestone": "M10",
      "themeId": "integration-application",
      "hint": "Z. B. Format, Protokoll, Vertrag. Auch technische Änderungen ohne neue Schnittstelle zählen, z. B. Protokollwechsel, neue Version eines bestehenden Contracts, Format-/Schema-Änderungen."
    },
    {
      "id": "I3",
      "text": "Entsteht eine neue Applikationskomponente oder wird eine bestehende wesentlich verändert?",
      "milestone": "M10",
      "themeId": "integration-application",
      "hint": "Z. B. Technologiewechsel, Ablösung. Auch ohne neue/geänderte Schnittstelle relevant — z. B. reiner Technologie- oder Plattformwechsel einer bestehenden Komponente."
    },
    {
      "id": "S3",
      "text": "Wechselt eine bestehende Datenhaltung den Ort?",
      "milestone": "M10",
      "themeId": "data-storage",
      "hint": "Anderes Land, anderer Anbieter oder andere Plattform."
    },
    {
      "id": "S4",
      "text": "Kommen in einer bestehenden Datenhaltung neue Datenarten dazu?",
      "milestone": "M10",
      "themeId": "data-storage"
    },
    {
      "id": "K1",
      "text": "Liegt die Schutzklasse (K0–K4) vor?",
      "milestone": "M20",
      "themeId": "data-classification",
      "hint": "Dummy-Frage — Fachinhalt folgt.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "cat-sc2",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Ist ein Prozess für den Umgang mit Security-Incidents definiert?",
      "source": "AWS Well-Architected, Security / FINMA-RS 2023/1"
    },
    {
      "id": "K2",
      "text": "Sind die abgeleiteten Datenhaltungsvorgaben berücksichtigt?",
      "milestone": "M20",
      "themeId": "data-classification",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "IA1",
      "text": "Liegt das Kontextdiagramm vor?",
      "milestone": "M20",
      "themeId": "integration-application",
      "hint": "Dummy-Frage — das Kontextdiagramm ist Lieferobjekt der Architektur.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "IA2",
      "text": "Sind alle Schnittstellen dokumentiert?",
      "milestone": "M20",
      "themeId": "integration-application",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "CI1",
      "text": "Ist die Zielumgebung definiert und abgenommen?",
      "milestone": "M20",
      "themeId": "cloud-infrastructure",
      "hint": "Dummy-Frage — Fachinhalt folgt.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "CI2",
      "text": "Sind die Infrastrukturvorgaben eingehalten?",
      "milestone": "M20",
      "themeId": "cloud-infrastructure",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "SC10",
      "text": "Liegt das Ergebnis der zuständigen Stelle vor?",
      "milestone": "M20",
      "themeId": "security-compliance",
      "hint": "Dummy-Frage — Prüfung erfolgt extern.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "AM1",
      "text": "Sind Rollen und Berechtigungen wie geplant umgesetzt?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "hint": "Dummy-Frage — Fachinhalt folgt.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "AM2",
      "text": "Läuft die Authentifizierung über die zentralen IdM/IAM-Dienste?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "E1",
      "kind": "text",
      "text": "Um welche Datenhaltung geht es?",
      "hint": "Name und Ort des Bestands, z. B. Applikation, Datenbank, SaaS-Lösung. Grundlagen im Thema Datenhaltung (Info-Icon). Auch App-Daten, Backup und Logs als eigene Datenhaltung erfassen, wenn sie unterschiedlich eingestuft werden könnten (z. B. Logs mit eigener CID-/Aufbewahrungslage gegenüber den Primärdaten — Beispiel Demo.alpha: Benutzerdaten/Prozessinfos/Log-Files sind dort separate Datenklassen mit je eigenen RPO/RTO-Werten).",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E2",
      "text": "Bleiben die Daten dort liegen (nicht nur Anzeige)?",
      "hint": "Nur Anzeige → keine Datenhaltung; die Prüfung endet hier und wird auf dem OnePager entsprechend eingetragen.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E3",
      "text": "Ist der Inhalt NICHT für die Veröffentlichung bestimmt?",
      "hint": "Nein → K0, die weiteren Einstufungsfragen entfallen. Ja → mindestens K1. Massgebend ist die Bestimmung, nicht ob man den Inhalt veröffentlichen könnte.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E4",
      "text": "Geht es in den Daten um bestimmte Personen?",
      "hint": "Gemeint sind z. B. Kunden, Mitarbeitende, Partner. Nein → K1, Ja → mindestens K2. Nein heisst: rein interne Inhalte wie Prozessbeschreibungen oder Konfigurationen ohne Passwörter.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E5",
      "text": "Enthalten die Daten Inhalte, die einer betroffenen Person ernsthaft schaden würden, wenn sie nach aussen gelangen?",
      "hint": "Ja → mindestens K3. Gesundheit, Bonität, finanzielle Situation — auch wenn sie nur in Freitextfeldern, Notizen oder Anhängen vorkommen.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E6",
      "text": "Könnte jemand mit diesen Daten unmittelbar handeln?",
      "hint": "Gemeint ist z. B.: Geld bewegen, sich als jemand anderes ausgeben, Zugang verschaffen. Ja → K4. Konto- und Transaktionsdaten, Zahlungsmittel, Identitätsnachweise, Passwörter, Schlüssel, Administrationszugänge.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E7",
      "text": "Entstehen diese Daten hier, statt aus einem anderen System zu stammen?",
      "hint": "Verstärkerfrage, nur ab Grundklasse K2 beantworten.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E8",
      "text": "Bewegt sich Geld oder ändert sich eine Berechtigung oder ein Vertrag, wenn hier jemand unbemerkt Daten verändert?",
      "hint": "Verstärkerfrage: mindestens ein Ja → eine Stufe höher, höchstens eine. K4 bleibt K4.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E9",
      "text": "Steht das Kerngeschäft still, wenn diese Daten nicht mehr verfügbar sind?",
      "hint": "Verstärkerfrage, nur ab Grundklasse K2 beantworten.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "E10",
      "kind": "choice",
      "text": "Welche Schutzklasse ergibt sich (K0–K4)?",
      "hint": "Ausgangspunkt ist die Schutzklasse aus M10 (Datenklassifikation, D0). Weicht diese konkrete Datenhaltung davon ab (höher z. B. durch Aggregation, tiefer z. B. bei Anonymisierung), hier begründen. Bei «Weiss nicht» gilt die nächsthöhere plausible Klasse, sonst «nicht beurteilbar». Eine bewusst zu tiefe Einstufung ist nicht zulässig.",
      "milestone": "M20",
      "themeId": "data-storage",
      "options": [
        "K0",
        "K1",
        "K2",
        "K3",
        "K4",
        "nicht beurteilbar"
      ]
    },
    {
      "id": "T1",
      "kind": "text",
      "text": "In welchem Land liegen die Daten?",
      "hint": "Liegen Teile an mehreren Orten (Reporting, Testumgebung, Cache), sind alle zu nennen.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "T2",
      "kind": "choice",
      "text": "Um welche Art von Umgebung handelt es sich?",
      "hint": "Eigenes Rechenzentrum, Private Cloud, Public Cloud oder SaaS.",
      "milestone": "M20",
      "themeId": "data-storage",
      "options": [
        "eigenes Rechenzentrum",
        "Private Cloud",
        "Public Cloud",
        "SaaS"
      ]
    },
    {
      "id": "T3",
      "text": "Ist der Datenhaltungsort belegbar?",
      "hint": "Vertrag, Regionseinstellung oder schriftliche Herstellerangabe — Beleg in den Bemerkungen festhalten.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "T4",
      "text": "Können Personen aus dem Ausland auf die Daten zugreifen?",
      "hint": "Etwa über Anbieter-Support, Subunternehmer, Fernwartung oder Betriebsteams im Ausland. Wird nur festgehalten, ist keine Abweichung.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "T5",
      "text": "Werden die Daten gesichert?",
      "hint": "Backup-Ort nach Land und Art in den Bemerkungen; das Restore-Ziel zählt dazu.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "T6",
      "kind": "text",
      "text": "Wie sind Logs, Monitoring und wiederkehrende Exporte geregelt?",
      "hint": "Was wird protokolliert, wo liegen die Protokolle, welche Auszüge verlassen das System regelmässig?",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "R1",
      "text": "Passen Datenhaltungsort und Backup-Ort zur Schutzklasse?",
      "hint": "Abgleich gegen die Vorgaben je Schutzklasse im Thema Datenhaltung. Nein → Abweichung unten beschreiben.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "R2",
      "text": "Passen Logs und Monitoring zur Schutzklasse?",
      "hint": "Nein → Abweichung unten beschreiben.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "R3",
      "text": "Passen Kopien und Exporte zur Schutzklasse?",
      "hint": "Nein → Abweichung unten beschreiben.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "R4",
      "kind": "text",
      "text": "Abweichungen: Was weicht ab, wer akzeptiert das Risiko, bis wann behoben?",
      "hint": "Risikoakzeptanz mit Rolle und Person dokumentieren. Nur ausfüllen, wenn eine Abgleichfrage mit Nein beantwortet wurde. Solange die Risikoakzeptanz nicht dokumentiert vorliegt, bleibt die Condition offen.",
      "milestone": "M20",
      "themeId": "data-storage"
    },
    {
      "id": "cat-dc1",
      "themeId": "data-classification",
      "milestone": "M20",
      "text": "Sind alle Datenkategorien des Vorhabens inventarisiert und klassifiziert?",
      "source": "BSI IT-Grundschutz, CON.2 / Datenschutz"
    },
    {
      "id": "cat-dc2",
      "themeId": "data-classification",
      "milestone": "M20",
      "text": "Ist der Umgang mit besonders schützenswerten Personendaten geregelt?",
      "hint": "Gesundheit, Religion, biometrische Daten usw.",
      "source": "CH-DSG (revidiert), Art. 5"
    },
    {
      "id": "cat-ia1",
      "themeId": "integration-application",
      "milestone": "M20",
      "text": "Sind Schnittstellen versioniert und abwärtskompatibel geplant?",
      "source": "TOGAF Architecture Compliance Review (paraphrasiert)"
    },
    {
      "id": "cat-ia2",
      "themeId": "integration-application",
      "milestone": "M20",
      "text": "Ist die Fehlerbehandlung über Systemgrenzen definiert?",
      "source": "aim42 / TOGAF Compliance Review",
      "hint": "Z. B. Retry, Idempotenz, Timeouts."
    },
    {
      "id": "cat-ia3",
      "themeId": "integration-application",
      "milestone": "M20",
      "text": "Liegt ein aktuelles Kontextdiagramm mit allen Nachbarsystemen vor?",
      "source": "arc42, Kapitel 3 (Kontextabgrenzung)"
    },
    {
      "id": "cat-ci1",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "text": "Verkraftet die Lösung den Ausfall einer einzelnen Komponente ohne Serviceunterbruch?",
      "source": "AWS Well-Architected, Reliability"
    },
    {
      "id": "cat-ci2",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "text": "Sind Wiederherstellungsziele (RTO/RPO) definiert und getestet?",
      "source": "AWS Well-Architected, Reliability"
    },
    {
      "id": "cat-ci3",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "text": "Werden Infrastruktur-Änderungen automatisiert und nachvollziehbar ausgerollt?",
      "source": "AWS Well-Architected, Operational Excellence",
      "hint": "Stichwort: Infrastructure as Code (IaC)."
    },
    {
      "id": "cat-sc1",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Werden Daten bei der Übertragung und bei der Speicherung verschlüsselt?",
      "source": "AWS Well-Architected, Security"
    },
    {
      "id": "cat-sc3",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Werden eingesetzte Komponenten und Abhängigkeiten auf bekannte Schwachstellen geprüft?",
      "source": "OWASP ASVS"
    },
    {
      "id": "cat-am1",
      "themeId": "idm-iam",
      "milestone": "M20",
      "text": "Ist für administrative Zugriffe Multi-Faktor-Authentifizierung erzwungen?",
      "source": "OWASP ASVS / AWS Well-Architected, Security"
    },
    {
      "id": "cat-am2",
      "themeId": "idm-iam",
      "milestone": "M20",
      "text": "Folgen die Berechtigungen dem Least-Privilege-Prinzip?",
      "source": "AWS Well-Architected, Security"
    },
    {
      "id": "B1",
      "text": "Ist die Betriebsorganisation für die Lösung geklärt?",
      "milestone": "M40",
      "themeId": "operations",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "B2",
      "text": "Liegen Betriebshandbuch und Supportprozesse vor?",
      "milestone": "M40",
      "themeId": "operations",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "B3",
      "text": "Sind Backup, Monitoring und Alarmierung definiert?",
      "milestone": "M40",
      "themeId": "operations",
      "source": "Dummy — Fachinhalt folgt",
      "minClassification": "wegweisend"
    },
    {
      "id": "DO1",
      "text": "Ist die Architekturdokumentation aktuell?",
      "milestone": "M40",
      "themeId": "documentation",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "DO2",
      "text": "Sind Architekturentscheide nachvollziehbar dokumentiert?",
      "milestone": "M40",
      "themeId": "documentation",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "U1",
      "milestone": "M40",
      "themeId": "data-storage",
      "text": "Sind die Datenhaltungsvorgaben im Betrieb weiterhin eingehalten (Überprüfung)?",
      "hint": "Betriebsnahe Überprüfung von Ort, Backup, Logs und Exporten gegen die Schutzklasse.",
      "source": "Architekturprüfmodell, MS40 (Überprüfung)"
    },
    {
      "id": "cat-ds1",
      "themeId": "data-storage",
      "milestone": "M40",
      "text": "Werden Backups regelmässig durch Restore-Tests verifiziert?",
      "source": "BSI IT-Grundschutz, CON.3 Datensicherungskonzept"
    },
    {
      "id": "cat-ci4",
      "themeId": "cloud-infrastructure",
      "milestone": "M40",
      "text": "Werden Kapazität und Kosten der Zielumgebung laufend überwacht?",
      "source": "AWS Well-Architected, Cost Optimization"
    },
    {
      "id": "cat-am3",
      "themeId": "idm-iam",
      "milestone": "M40",
      "text": "Werden Berechtigungen regelmässig überprüft und rezertifiziert?",
      "source": "BSI IT-Grundschutz, ORP.4"
    },
    {
      "id": "cat-op1",
      "themeId": "operations",
      "milestone": "M40",
      "text": "Gibt es Runbooks für Standard- und Notfall-Betriebsabläufe?",
      "source": "AWS Well-Architected, Operational Excellence"
    },
    {
      "id": "cat-op2",
      "themeId": "operations",
      "milestone": "M40",
      "text": "Ist die Alarmierung mit klaren Eskalationswegen geregelt?",
      "source": "AWS Well-Architected, Operational Excellence / SRE-Praxis"
    },
    {
      "id": "cat-do1",
      "themeId": "documentation",
      "milestone": "M40",
      "text": "Folgt die Architekturdokumentation einer einheitlichen Struktur?",
      "source": "arc42",
      "hint": "Z. B. arc42."
    },
    {
      "id": "cat-do2",
      "themeId": "documentation",
      "milestone": "M40",
      "text": "Sind wesentliche Architekturentscheide als ADRs festgehalten?",
      "source": "aim42 / ADR-Praxis"
    },
    {
      "id": "cat-td1",
      "themeId": "technical-debt",
      "milestone": "M40",
      "text": "Sind bekannte technische Schulden mit Aufwand und Risiko bewertet?",
      "source": "aim42 (Improve)"
    },
    {
      "id": "D4",
      "text": "Ist der Inhalt NICHT für die Veröffentlichung bestimmt?",
      "milestone": "M10",
      "themeId": "data-classification",
      "hint": "Nein → K0, die weiteren Einstufungsfragen entfallen. Ja → mindestens K1. Massgebend ist die Bestimmung, nicht ob man den Inhalt veröffentlichen könnte."
    },
    {
      "id": "D1",
      "text": "Geht es in den Daten um bestimmte Personen?",
      "milestone": "M10",
      "themeId": "data-classification",
      "hint": "Gemeint sind z. B. Kunden, Mitarbeitende, Partner. Nein → höchstens Schutzklasse K1. Ja → mindestens K2. Beispiel: Namen, Adressen, Vertragsdaten von Kund:innen oder Mitarbeitenden."
    },
    {
      "id": "D2",
      "text": "Würde die Offenlegung dieser Daten einer betroffenen Person ernsthaft schaden?",
      "milestone": "M10",
      "themeId": "data-classification",
      "hint": "Ja → mindestens Schutzklasse K3. Beispiel: Bankgeheimnis-Bezug (Konto-/Depotdaten, Vermögensverhältnisse), Gesundheitsdaten, biometrische Daten."
    },
    {
      "id": "D5",
      "text": "Könnte jemand mit diesen Daten unmittelbar handeln?",
      "milestone": "M10",
      "themeId": "data-classification",
      "hint": "Gemeint ist z. B.: Geld bewegen, sich als jemand anderes ausgeben, Zugang verschaffen. Ja → K4. Beispiel: Konto- und Transaktionsdaten, Zahlungsmittel, Identitätsnachweise, Passwörter, Schlüssel, Administrationszugänge."
    },
    {
      "id": "D0",
      "text": "Welche Schutzklasse ergibt sich (K0–K4)?",
      "milestone": "M10",
      "themeId": "data-classification",
      "kind": "choice",
      "options": [
        "K0",
        "K1",
        "K2",
        "K3",
        "K4",
        "nicht beurteilbar"
      ],
      "hint": "Aus D4/D1/D2/D5 abgeleitet: D4 Nein → K0. D4 Ja → mindestens K1, D1 Ja → mindestens K2. D2 Ja → mindestens K3. D5 Ja → K4. Bei Unklarheit: «nicht beurteilbar».",
      "remarksAlwaysOpen": true
    },
    {
      "id": "D3",
      "text": "Welche Schutzklasse ergibt sich?",
      "milestone": "M20",
      "themeId": "data-classification",
      "kind": "choice",
      "hint": "Daraus leiten sich die Datenhaltungsvorgaben ab.",
      "options": [
        "K0",
        "K1",
        "K2",
        "K3",
        "K4",
        "nicht beurteilbar"
      ],
      "source": "Dummy — Fachinhalt folgt",
      "minClassification": "wegweisend"
    },
    {
      "id": "A1",
      "text": "Werden neue Rollen oder Berechtigungen eingeführt?",
      "milestone": "M10",
      "themeId": "idm-iam"
    },
    {
      "id": "A2",
      "text": "Entsteht eine neue Anbindung an die zentralen IdM/IAM-Dienste oder wird eine bestehende wesentlich geändert?",
      "milestone": "M10",
      "themeId": "idm-iam",
      "hint": "Z. B. neuer Identity Provider, neues Föderationsmuster, Wechsel des IdM/IAM-Dienstes selbst."
    },
    {
      "id": "A4",
      "text": "Entstehen neue oder wesentlich veränderte privilegierte Zugriffe (Admin, Wartung)?",
      "milestone": "M10",
      "themeId": "idm-iam",
      "hint": "Auch Änderungen an bestehenden privilegierten Zugriffsmustern zählen, z. B. neue Break-Glass-Prozesse, verändertes Wartungs-/Update-Rechtemodell."
    },
    {
      "id": "A5",
      "text": "Erhalten externe Parteien (z. B. Kunden, Drittanbieter/TPP) direkten Zugriff auf das System?",
      "milestone": "M10",
      "themeId": "idm-iam",
      "hint": "Abgrenzung zu A2: A2 betrifft die Anbindung interner Nutzer (Mitarbeitende) an IdM/IAM, diese Frage den Zugriff von ausserhalb der eigenen Organisation. Bei Ja: eigenes Bedrohungsmodell, WAF-/API-Gateway-Härtung sowie vertragliche/regulatorische Fragen (z. B. Open-Banking/TPP-Szenarien) zusätzlich prüfen."
    },
    {
      "id": "A3",
      "text": "Sind privilegierte Zugriffe geregelt (Admin, Wartung)?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "SC0",
      "text": "Entstehen neue oder wesentlich veränderte Schnittstellen nach aussen?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Z. B. neue externe Integrationen, neue Identity-/Access-Anbindungen. Entwurf — Formulierung und Kriterienliste mit Security & Compliance abstimmen. Löst bei Ja die Übergabe an die zuständige Stelle aus (s. SC1)."
    },
    {
      "id": "SC2",
      "text": "Entsteht neue oder wesentlich veränderte Datenverarbeitung?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Z. B. neue Datenflüsse, neue Speicherorte/-systeme, neue Verarbeitungszwecke. Entwurf — Formulierung und Kriterienliste mit Security & Compliance abstimmen. Löst bei Ja die Übergabe an die zuständige Stelle aus (s. SC1)."
    },
    {
      "id": "SC3",
      "text": "Bestehen regulatorische Anforderungen an das Vorhaben?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Z. B. FINMA-Vorgaben, DSG. Entwurf — Formulierung und Kriterienliste mit Security & Compliance abstimmen. Löst bei Ja die Übergabe an die zuständige Stelle aus (s. SC1)."
    }
  ],
  "classificationInfoMd": "# Klassifikation\n\nDie Klassifikation ist das Ergebnis der Foundation-Prüfung (M10) und Teil\nder Freigabe:\n\n- **nicht relevant** — alle Relevanz-Fragen sind mit Nein beantwortet.\n  Es findet keine weitere Architekturprüfung statt (kein M20/M40).\n- **relevant** — das Projekt berührt die Architektur; die Fragenkataloge\n  M20 und M40 werden geprüft.\n- **wegweisend** — das Projekt prägt die Architektur; zusätzlich werden\n  die als «ab wegweisend» markierten Fragen gestellt.\n\nOb ein Projekt architekturrelevant ist, ergibt sich automatisch aus den\nJa/Nein-Fragen im M10 (mindestens eine Frage mit Ja → relevant; alle Nein\n→ nicht relevant).\n\nOb ein relevantes Projekt zusätzlich **wegweisend** ist, entscheidet\nder/die Architekt/in anhand folgender Kriterien (mindestens eines trifft zu):\n\n- **Referenz-/Pilotcharakter** — das Projekt führt ein Muster, eine\n  Technologie oder eine Plattform ein, die anschliessend als Vorlage für\n  weitere Projekte dient.\n- **Wirkung über das Projekt hinaus** — Entscheide betreffen mehrere\n  Systeme, mehrere Mandanten/Banken oder die gemeinsame Plattform, nicht\n  nur die Applikation des Projekts selbst.\n- **Abweichung von bestehenden Vorgaben** — das Projekt weicht bewusst von\n  einem etablierten Standard ab, und diese Abweichung soll künftig als\n  Präzedenzfall/neue Richtlinie gelten (nicht nur als Einzelfall-Ausnahme).\n- **Hohe Tragweite bei Fehlentscheid** — Risiko, Kosten oder regulatorische\n  Sichtbarkeit sind so hoch, dass ein Fehler in der Architekturprüfung\n  überproportionalen Schaden anrichten würde.\n",
  "company": "DEMOCOMPANY",
  "auth": {
    "enabled": true,
    "tenantId": "b7c70efe-b7ac-4b20-8b66-7d91a6d472e6",
    "clientId": "576bfb92-4b3e-4b13-bb89-816cc356516a",
    "adminRole": "ArchReview.Admin",
    "reviewerRole": "ArchReview.Reviewer",
    "viewerRole": "ArchReview.Viewer"
  }
};
