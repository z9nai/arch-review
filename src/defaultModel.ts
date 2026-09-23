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
      "infoMd": "# Datenklassifikation\n\n## Zweck\n\nStuft die Daten eines Vorhabens ein (an SCHUBAN angelehnt, mit eigener Skala) und leitet daraus die anzuwendenden Datenhaltungsvorgaben ab. Die Einstufung ist Grundlage für alle Fragen im Thema Datenhaltung — sie entscheidet, welche Schutzklasse (K0–K4) gilt.\n\n## Schutzklassen\n\n| Klasse | Bedeutung |\n|---|---|\n| K0 Öffentlich | Zur Veröffentlichung bestimmt oder bereits öffentlich |\n| K1 Intern | Intern bestimmt, ohne Personen- oder Kundenbezug |\n| K2 Vertraulich | Daten von Kunden oder Mitarbeitenden ohne besondere Brisanz |\n| K3 Hochvertraulich | Inhalte, deren Offenlegung den Betroffenen ernsthaft schadet |\n| K4 Hochschutz | Daten, mit denen sich unmittelbar handeln lässt |\n\nDer Unterschied zwischen K0 und K1 liegt in der **Bestimmung**, nicht im Schaden. Ein zweckgebundener Datenausschnitt kann tiefer eingestuft werden als der vollständige, führende Bestand — massgebend sind Inhalt und Rolle im Systemverbund, nicht die Zahl der Betroffenen.\n\n## Vorgaben\n\n- Schutzbedarfsanalyse durchführen\n- Einstufung dokumentieren\n- Ableitung der Datenhaltungsvorgaben → Thema Datenhaltung\n"
    },
    {
      "id": "data-storage",
      "title": "Datenhaltung",
      "infoMd": "# Datenhaltung\n\n## Zweck\n\nDiese Übersicht legt fest, wo Daten je Schutzklasse gehalten werden dürfen und wo deren Backups liegen dürfen. Sie dient dem Nachschlagen. Das Prüfformular ist ein eigenes Dokument («Prüfformular Datenhaltung») und wird je Projekt ausgefüllt.\n\nEs gilt für neue oder geänderte Datenhaltungen in Projekten, Applikationen, Plattformen, Cloud- und SaaS-Lösungen, Datenbanken, Dateiablagen, Reporting-Umgebungen, Exporten, Caches und Backups.\n\nZur Datenhaltung gehören auch Bestände, an die man zuerst nicht denkt:\n\n- Reporting- und Auswertungsbestände\n- Logs und Monitoringdaten, sofern sie Personendaten, Tokens oder Secrets enthalten\n- persistente Caches, die Daten über die Verarbeitung hinaus behalten\n- prozessual vorgesehene Exporte, etwa ein wiederkehrender Auszug in eine andere Umgebung\n- Testumgebungen mit Produktivdaten\n- Backups und Snapshots\n\n**Keine** Datenhaltung ist die blosse Möglichkeit, Daten zu exportieren. Ein Export zählt erst, wenn der Prozess ihn vorsieht, er regelmässig entsteht oder das Ergebnis abgelegt wird. Ebenso wenig zählen die reine Übertragung und die reine Anzeige ohne Speicherung.\n\nNicht Gegenstand: Löschfristen und Aufbewahrungspflichten, Berechtigungskonzepte, Datenschutzfreigaben, Security-Konzept, Betriebs- und Wiederherstellungskonzepte.\n\n## Schutzklassen\n\nSiehe Thema Datenklassifikation, Abschnitt «Schutzklassen» — hier nur referenziert, nicht mehr dupliziert.\n\n## Grundprinzipien\n\n- Massgebend ist der **Inhalt** der Datenhaltung, weder der Name der Applikation noch die Personengruppe.\n- Die **höchste zutreffende Klasse** gilt für die gesamte Datenhaltung.\n- Liegt die Datenhaltung an mehreren Orten, gilt der **strengste Fall**.\n- Kopien, Exporte, Reporting-Bestände, Caches, Backups und Restore-Ziele **übernehmen die Klasse** der enthaltenen Daten.\n- **Unklarheit ist kein zulässiges Ergebnis**: Fehlen Angaben, lautet das Ergebnis «nicht beurteilbar», nicht «in Ordnung».\n- Labels, DLP, Verschlüsselung und Monitoring unterstützen, ersetzen aber weder Einstufung noch zulässigen Ort.\n\n## Vorgaben je Schutzklasse\n\nGrundlage für die Felder M20B15 bis M20B17 im Prüfformular. Die Anforderungen sind kumulativ.\n\n| Klasse | Zulässige Datenhaltung | Logs und Monitoring | Kopien und Exporte |\n|---|---|---|---|\n| K0 | Kein zwingender Datenraum | Normales Betriebsmonitoring | Keine Einschränkung |\n| K1 | Intern oder Cloud/SaaS, Schweiz als Standard | Normales Betriebsmonitoring | Keine Ablage in persönlichen oder unkontrollierten Bereichen |\n| K2 | Schweiz erforderlich, Cloud/SaaS Schweiz möglich | Monitoring erforderlich, keine Nutzdaten, Secrets oder Tokens in Logs | Nur zweckgebunden |\n| K3 | Schweiz und restriktiv kontrollierter Ort | Zusätzlich nachvollziehbare Protokollierung | Nur wenn fachlich notwendig |\n| K4 | Private Cloud oder dedizierter Hochschutz-Ort Schweiz | Zusätzlich auditierbare Protokollierung | Grundsätzlich zu vermeiden |\n\nFür K0 keine verbindliche Ortsvorgabe. Für K1 gilt die Schweiz als Standard; eine Abweichung vom Standardort allein ist keine Condition.\n\n## Abweichungen und Risikoakzeptanz\n\nDie Architektur bewertet die Abweichung, die Risikoakzeptanz erfolgt durch die zuständige Entscheidungsebene.\n\n| Situation | Erwartete Behandlung |\n|---|---|\n| Abweichung bei K2 oder K3 | Risikoanalyse und dokumentierte Risikoakzeptanz |\n| Abweichung bei K4 | Grundsätzlich nicht zulässig, es braucht eine explizite Ausnahmeentscheidung |\n| Ort nicht belegbar oder Zugriff aus dem Ausland unklar | Nicht beurteilbar, bis ein Nachweis vorliegt |\n"
    },
    {
      "id": "integration-application",
      "title": "Integrations- und Applikationsarchitektur",
      "infoMd": "# Integrations- und Applikationsarchitektur\n\n*Zweck ausformuliert (Entwurf Claude, 02.09.2026) — Vorgaben (Detailregeln) noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft, ob neue oder geänderte Schnittstellen und Applikationskomponenten den etablierten Integrationsmustern folgen und sauber gegen den bestehenden Applikationsbestand abgegrenzt sind.\n\n## Vorgaben\n\n- Kontextdiagramm als Lieferobjekt (Architektur, 2 PT)\n- Einhaltung der Integrationsmuster\n- Abgrenzung zu bestehenden Applikationen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "cloud-infrastructure",
      "title": "Cloud- und Infrastrukturarchitektur",
      "infoMd": "# Cloud- und Infrastrukturarchitektur\n\n*Zweck und Prüffragen ausformuliert (Entwurf Claude, 02./07.09.2026) — Detailregeln noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft die Wahl der Zielumgebung und Plattform sowie die Einhaltung der Infrastrukturvorgaben, inklusive der damit verbundenen Betriebsaspekte.\n\n## Vorgaben\n\n- Strategie-Leitplanke: «Cloud First im Workplace, risikoorientiert bei Kernbankenapplikationen» (IT-Strategie 2027–2030)\n- Zielumgebung und Plattformwahl (Betreiber, Plattform, Standort, dediziert/geteilt, Umgebungen)\n- Verantwortung je Plattformkomponente (Bereitstellung, Betrieb, Patching)\n- Sizing auf erhobener Basis, Resilienz (Ausfall einer Komponente, RTO/RPO), Infrastructure as Code\n- Exit-Szenario: siehe Thema Security & Compliance (M20E7)\n- Weitere Detailregeln noch offen — brauchen Fachinput\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "security-compliance",
      "title": "Security & Compliance",
      "infoMd": "# Security & Compliance\n\n*Zweck und Prüffragen neu gefasst (08.09.2026): Die Architektur beantwortet die sicherheitsrelevanten Architekturfragen selbst. Kriterien je Frage mit der Fachstelle Security & Compliance abstimmen.*\n\n## Zweck\n\nDie Architekturprüfung beurteilt die sicherheits- und compliance-relevanten Aspekte der Architektur selbst: regulatorische Einordnung, Bedrohungsanalyse, Sicherheitsanforderungen, Netzwerkzonierung, Verschlüsselung, Umgang mit Schwachstellen, Exit-Szenario. Die Fachstelle Security & Compliance liefert die Kriterien und wird bei der M20-Abnahme über die Kontrollpunkte «FINMA-Prüfung» und «Lieferanten-Prüfung» einbezogen.\n\n## Vorgaben\n\n- FINMA-RS 2023/1 Rz 32: ad hoc Risiko- und Kontrollbeurteilung vor wesentlichen Änderungen in Produkten, Aktivitäten, Prozessen und Systemen\n- FINMA-RS 2018/3: Outsourcing-Relevanz (Dienstleister erfüllt selbständig und dauernd eine wesentliche Funktion), Exit-Szenario\n- DSG: Personendaten, ggf. Datenschutz-Folgenabschätzung\n- Vor Produktivsetzung (M40): verlangte Security-Nachweise liegen vor, Massnahmen sind belegt, System ist in den Incident-Prozess eingebunden\n- Detailkriterien (Threat Model, Verschlüsselung, Schwachstellen-Regime) noch offen — brauchen Fachinput\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte.\n"
    },
    {
      "id": "idm-iam",
      "title": "IdM / IAM",
      "infoMd": "# IdM / IAM\n\n*Zweck und Prüffragen ausformuliert (Entwurf Claude, 02./07.09.2026) — Detailregeln noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft Rollen- und Berechtigungskonzept, Anbindung an die zentralen IdM/IAM-Dienste, Provisionierung und den Umgang mit privilegierten und externen Zugriffen. Die Härtung (MFA, Least Privilege, Session-Handling) beurteilt der Security-Review — hier geht es um Konzept, Anbindung und Verantwortlichkeiten.\n\n## Vorgaben\n\n- Authentifizierung über die zentralen IdM/IAM-Dienste, keine lokalen Konten\n- Rollen- und Berechtigungskonzept mit Verantwortlichkeiten (pflegen, zuweisen, freigeben)\n- Vergabe und Entzug über die zentralen Prozesse (Eintritt, Wechsel, Austritt)\n- Privilegierte Zugriffe je Partei geregelt, protokolliert, freigegeben\n- Externe Zugriffe mit eigenem Zugriffsmodell\n- Weitere Detailregeln noch offen — brauchen Fachinput\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte.\n"
    },
    {
      "id": "operations",
      "title": "Betriebsarchitektur",
      "infoMd": "# Betriebsarchitektur\n\n*Zweck und Prüffragen ausformuliert (Entwurf Claude, 02./07.09.2026) — Detailregeln noch offen, brauchen Fachinput.*\n\n## Zweck\n\nPrüft betriebsnah, ob die Lösung organisatorisch und prozessual betriebsbereit ist: Betriebsorganisation und Support-Kette, Betriebshandbuch und Runbooks, Monitoring und Alarmierung, Datensicherung als Betriebsroutine, Release- und Change-Prozess. Abgrenzung: Ob die Plattform ist, was sie sein soll (Bau, Resilienztest), prüft Cloud- und Infrastrukturarchitektur (M40D1–M40D3); hier geht es um die Organisation und die Routinen, die sie am Laufen halten.\n\n## Vorgaben\n\n- Betriebsorganisation mit Verantwortlichen je Komponente, Support-Kette Bank → Betreiber → Hersteller, SLAs\n- Betriebshandbuch und Runbooks für Standard- und Notfallabläufe\n- Monitoring und Alarmierung mit Eskalationswegen\n- Datensicherung als Betriebsroutine (Überwachung, Restore-Tests, Aufbewahrung)\n- Release- und Change-Prozess inkl. herstellerseitiger Zwänge\n- Weitere Detailregeln noch offen — brauchen Fachinput\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte.\n"
    },
    {
      "id": "documentation",
      "title": "Dokumentation",
      "infoMd": "# Dokumentation\n\n*Zweck und Prüffragen ausformuliert (Entwurf Claude, 02./07.09.2026) — Struktur- und Ablagevorgabe noch zu klären; vorläufig gilt LeanIX als Referenz.*\n\n## Zweck\n\nPrüft, ob die Architektur- und Lösungsdokumentation zum Projektabschluss dem entspricht, was läuft, ob Architekturentscheide nachvollziehbar begründet sind und ob die Dokumentation dort verankert ist, wo sie gefunden wird.\n\n## Vorgaben\n\n- Dokumentation auf dem Stand der umgesetzten Lösung (Zielarchitektur, Schnittstellen, Datenhaltung, Betrieb)\n- Wesentliche Architekturentscheide mit Alternativen und Begründung festgehalten\n- Vorläufig: LeanIX als Referenz — Applikations-Factsheet mit Verknüpfung zur Lösungsdokumentation; Struktur- und Ablagevorgabe (z. B. arc42, Dokumentablage) noch offen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte.\n"
    },
    {
      "id": "technical-debt",
      "title": "Technische Schulden / Risiken / Conditions",
      "infoMd": "# Technische Schulden / Risiken / Conditions\n\n*Zweck und Prüffragen ausformuliert (Entwurf Claude, 02./07.09.2026).*\n\n## Zweck\n\nHält am Projektende die Bilanz: technische Schulden mit Aufwand und Risiko, eine grobe Einordnung des Behebungsaufwands (keine / Low / Medium / High) und den Status aller Conditions aus M10–M40 — jede mit Verantwortlichem und Termin oder mit dokumentierter Risikoakzeptanz. Das Ergebnis speist die Zeile Risiken/Conditions des OnePagers.\n\n## Vorgaben\n\n- Technische Schulden erfassen und bewerten (Auswirkung, Risiko, Behebungsaufwand)\n- Behebungsaufwand gesamthaft einordnen: keine / Low (laufender Betrieb) / Medium (Arbeitspaket) / High (Projekt oder Budgetantrag)\n- Conditions aus allen Meilensteinen: Owner und Termin oder Risikoakzeptanz — nichts bleibt ohne beides\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte.\n"
    }
  ],
  "questions": [
    {
      "id": "q9a3zestv5p",
      "text": "Ist die finale Zielarchitektur dokumentiert und freigegeben — inklusive Einordnung in die Unternehmensarchitektur und der Geschäftsfunktionen, die das System unterstützt?",
      "milestone": "M20",
      "themeId": "integration-application",
      "hint": "Zielarchitektur umfasst alle Integrationspunkte, Datenflüsse und Abhängigkeiten zu Drittsystemen; Freigabe durch alle Beteiligten (Betreiber, Hersteller, Auftraggeber). Insb. relevant, wenn der Betreiber (nicht der Auftraggeber) die finale Architektur definiert - dann muss der Freigabeprozess/das Review explizit geregelt sein. Einordnung in die Unternehmensarchitektur: Zielbild, Applikationslandschaft, Abhängigkeiten; die unterstützten Geschäftsfunktionen und -prozesse sind benannt."
    },
    {
      "id": "SC13",
      "themeId": "security-compliance",
      "milestone": "M20",
      "remarksAlwaysOpen": true,
      "text": "Sind die regulatorischen Anforderungen des Vorhabens identifiziert — FINMA-RS 2023/1 Rz 32 (Risikobeurteilung bei wesentlicher Änderung), FINMA-RS 2018/3 (Outsourcing), DSG — und ist geklärt, wer die Einhaltung nachweist?",
      "hint": "Wesentliche Änderung der Systemlandschaft → ad hoc Risiko- und Kontrollbeurteilung (FINMA-RS 2023/1 Rz 32). Outsourcing im Sinne von FINMA-RS 2018/3, wenn ein Dienstleister selbständig und dauernd eine für die Geschäftstätigkeit wesentliche Funktion erfüllt. DSG: Personendaten, ggf. Datenschutz-Folgenabschätzung. Das Ergebnis fliesst in die Kontrollpunkte «FINMA-Prüfung» und «Lieferanten-Prüfung» der M20-Abnahme. Entwurf — Kriterien mit der Fachstelle Security & Compliance abstimmen."
    },
    {
      "id": "SC14",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Liegt eine Bedrohungsanalyse (Threat Model) vor — Angriffsflächen, Schutzziele je Schutzklasse (M10A5), abgeleitete Massnahmen?",
      "hint": "Angriffsflächen aus Kontextdiagramm (M20C4) und Zonierung (M20E4); Schutzziele Vertraulichkeit, Integrität, Verfügbarkeit je Schutzklasse; je Bedrohung eine Massnahme oder eine dokumentierte Akzeptanz. Tiefe nach Schutzklasse. Entwurf — Kriterien mit der Fachstelle Security & Compliance abstimmen."
    },
    {
      "id": "cat-nist-p15",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Sind die Sicherheits- und Datenschutzanforderungen für System und Betriebsumgebung definiert — abgeleitet aus Schutzklasse, Bedrohungsanalyse (M20E2) und regulatorischen Vorgaben (M20E1)?",
      "hint": "Anforderungen benennen, nicht Massnahmen: was das System und was die Betriebsumgebung (Plattform, Betreiber) erfüllen muss. Wer welche Anforderung umsetzt, steht in M20D3. Original: Define the security and privacy requirements for the system and the environment of operation.",
      "source": "NIST SP 800-37 Rev. 2, RMF Prepare, Task P-15 (Requirements Definition)"
    },
    {
      "id": "SC15",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Ist die Netzwerkzonierung beschrieben — welche Komponenten sind von aussen erreichbar, über welche Eintrittspunkte (API-Gateway, WAF, Reverse Proxy), welche liegen in internen Zonen?",
      "hint": "Gegenstück zu M10E1. Jede Schnittstelle nach aussen hat genau einen kontrollierten Eintrittspunkt; interne Zonen sind von aussen nicht direkt erreichbar. Das Zugriffsmodell für externe Parteien (Identität, Berechtigung) ist Sache von M20F6."
    },
    {
      "id": "cat-sc1",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Werden Daten bei Übertragung und Speicherung verschlüsselt — passend zur Schutzklasse, mit geklärter Schlüsselverwaltung (wer hält die Schlüssel: Bank, Betreiber, Hersteller)?",
      "hint": "Transport (TLS auf allen Schnittstellen) und Speicherung (Datenbanken, Backups, Exporte). Bei Cloud-Plattformen ist die Schlüsselverwaltung die eigentliche Frage. Ob Ort und Backup-Ort zur Schutzklasse passen, prüft M20B15.",
      "source": "AWS Well-Architected, Security"
    },
    {
      "id": "cat-sc3",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Ist geregelt, wie eingesetzte Komponenten und Abhängigkeiten (Hersteller-Software, Container-Images, Bibliotheken) auf bekannte Schwachstellen geprüft und aktualisiert werden?",
      "hint": "Software-Supply-Chain: Scan vor dem Deployment und laufend; wer reagiert auf kritische Schwachstellen in welcher Frist. Die Patch-Verantwortung je Komponente steht in M20D3, der Release-Prozess in M40G5.",
      "source": "OWASP ASVS"
    },
    {
      "id": "CI5",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Ist ein Exit-Szenario beschrieben (Rückbau, Anbieterwechsel, Datenrückführung)?",
      "hint": "Für ausgelagerte oder Cloud-basierte Plattformen regulatorisch gefordert (Outsourcing-Vorgaben). Mindestens: Was passiert bei Abbruch oder Anbieterwechsel, wie kommen die Daten zurück, welche Abhängigkeiten (proprietäre Dienste, Operatoren, Formate) machen den Wechsel teuer."
    },
    {
      "id": "SC11",
      "themeId": "security-compliance",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist die Einstufung/Spezifikation dieses Themas durch das Architektur-Board abgenommen?",
      "hint": "Nur bei wegweisenden Projekten. Traktandum/Protokoll-Referenz in den Bemerkungen festhalten."
    },
    {
      "id": "cat-nist-p9",
      "themeId": "operations",
      "milestone": "M20",
      "text": "Sind die Anspruchsgruppen des Systems benannt — Fachbereich, Architektur, Entwicklung, Betrieb, Security, Datenschutz, Lieferant — über Entwurf, Umsetzung, Betrieb und Ausserbetriebnahme?",
      "hint": "Spezifikation der Beteiligten; die Betriebsorganisation mit Support-Kette und SLAs weist M40G1 nach. Original: Identify stakeholders who have an interest in the design, development, implementation, assessment, operation, maintenance, or disposal of the system.",
      "source": "NIST SP 800-37 Rev. 2, RMF Prepare, Task P-9 (System Stakeholders)"
    },
    {
      "id": "B1",
      "text": "Ist die Betriebsorganisation geklärt — Verantwortliche je Komponente, Support-Kette Bank → Betreiber → Hersteller, SLAs, Betriebszeiten?",
      "milestone": "M40",
      "themeId": "operations",
      "hint": "Baut auf M20D3 (wer stellt/betreibt/patcht) auf und macht es betriebsfähig: Wer nimmt Störungen entgegen, wer eskaliert zum Hersteller, welche Reaktions- und Lösungszeiten gelten, wer darf Changes beauftragen (RfC). Ein Vertrag ohne benannte Personen/Rollen ist keine Betriebsorganisation."
    },
    {
      "id": "B2",
      "text": "Liegen Betriebshandbuch und Runbooks für Standard- und Notfallabläufe vor?",
      "milestone": "M40",
      "themeId": "operations",
      "hint": "Start/Stop, Deployment, Backup/Restore, Failover, Wiederanlauf nach Ausfall, Incident-Behandlung — vom Betreiber geschrieben, von der Bank abgenommen. Ein Handbuch als Projektlieferobjekt zählt erst, wenn es da ist."
    },
    {
      "id": "B3",
      "text": "Sind Monitoring und Alarmierung eingerichtet — mit Eskalationswegen und Zuständigkeiten?",
      "milestone": "M40",
      "themeId": "operations",
      "hint": "Was wird überwacht (Verfügbarkeit, Kapazität, Fehler, Datenflüsse), wer bekommt welchen Alarm, wer eskaliert an wen, auch nachts und am Wochenende. Basis-Monitoring des Plattformbetreibers deckt die Applikation nicht ab — Tracing über die Kette hinweg explizit prüfen."
    },
    {
      "id": "qpzx51ivonp",
      "text": "Ist die Datensicherung im Betrieb eingerichtet — Backup-Läufe überwacht, Restore regelmässig getestet, Aufbewahrung geregelt?",
      "milestone": "M40",
      "themeId": "operations",
      "hint": "Die Betriebsroutine zu M20D6 (Konzept) und M40D2 (einmaliger Test vor PROD): Backup-Jobs laufen und werden überwacht, Restore wird periodisch geprobt, Aufbewahrungsfristen und Löschung sind umgesetzt — je Datenhaltung gemäss Schutzklasse (M40B1)."
    },
    {
      "id": "OP1",
      "themeId": "operations",
      "milestone": "M40",
      "text": "Ist der Release- und Change-Prozess geregelt — Takt, Test, Freigabe, Rollback, inkl. herstellerseitig erzwungener Updates?",
      "hint": "Wie kommen neue Versionen in Betrieb (Non-Prod vor Prod, Regressionstest, Freigabe), wer bestellt und bezahlt Releases, wie wird zurückgerollt. Herstellerseitige Zwänge (Mindestversion, Support-Fenster, untermonatliche Auslieferungen) müssen im Prozess und in der Kapazitätsplanung abgebildet sein."
    },
    {
      "id": "OP2",
      "themeId": "operations",
      "milestone": "M40",
      "minClassification": "wegweisend",
      "text": "Ist das Betriebsmodell als Referenz für Folgeprojekte dokumentiert?",
      "hint": "Verantwortungen, Support-Kette, Release-Prozess und Monitoring-Muster als wiederverwendbare Vorgabe — nicht nur im Betriebshandbuch dieses Projekts."
    },
    {
      "id": "qx7q7pxw95o",
      "text": "Ist das IAM-Konzept beschrieben — inkl. Federation zu externen Identity Providern und wer welches Glied der Kette (IdP → Broker → Applikation) verantwortet?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "hint": "Nicht nur architektonisch plausibel, sondern dokumentiert: Welche Identity Provider werden eingebunden, wer betreibt den Federation Broker, wer pflegt die Anbindung pro Umgebung, wie kommen Identitäten in die Applikation. Die technische Absicherung (Signaturprüfung, Claims-Mapping, Session-Handling) prüft der Security-Review."
    },
    {
      "id": "AM3",
      "themeId": "idm-iam",
      "milestone": "M20",
      "text": "Ist das Rollen- und Berechtigungskonzept beschrieben — Rollen, Zuordnung zu Funktionen, wer sie pflegt, wer sie freigibt?",
      "hint": "Auch bei Rollen, die der Hersteller als Templates liefert: Wer passt sie an, wer weist sie zu, wer gibt frei — Bank, Betreiber oder Hersteller. Ohne Verantwortlichkeit ist das Konzept nicht vollständig."
    },
    {
      "id": "AM2",
      "text": "Läuft die Authentifizierung über die zentralen IdM/IAM-Dienste — ohne eigenen Benutzerspeicher und ohne lokale Konten?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "hint": "Lokale Konten, eigene Passwortspeicher oder ein zweiter Login-Weg neben dem zentralen Dienst sind Abweichungen und gehören als Condition festgehalten. Technische Konten (Service-Accounts) explizit benennen."
    },
    {
      "id": "AM4",
      "themeId": "idm-iam",
      "milestone": "M20",
      "text": "Sind Vergabe und Entzug von Berechtigungen (Eintritt, Wechsel, Austritt) an die zentralen Prozesse angebunden — auch für Rollen-Templates des Herstellers?",
      "hint": "Provisionierung und Entzug müssen über dieselben Prozesse laufen wie bei den übrigen Systemen (Joiner/Mover/Leaver). Bei Migration: Sind bestehende Rollen übernehmbar, oder ist ein Neuaufbau nötig — und wer macht ihn?"
    },
    {
      "id": "A3",
      "text": "Ist für privilegierte Zugriffe geregelt, wer sie hat (Betreiber, Hersteller, Bank), wie sie protokolliert und freigegeben werden?",
      "milestone": "M20",
      "themeId": "idm-iam",
      "hint": "Admin-, Wartungs- und Update-Rechte je Partei, inklusive Rechte von Operatoren oder Agenten auf der Plattform. Die Härtung (MFA, Least Privilege, PAM) prüft der Security-Review — hier geht es um die Regelung und ihre Verantwortlichkeiten."
    },
    {
      "id": "AM5",
      "themeId": "idm-iam",
      "milestone": "M20",
      "text": "Ist für externe Zugriffe (Kunden, Drittanbieter/TPP) ein eigenes Zugriffsmodell beschrieben — Eintrittspunkt, Identität, Berechtigung, Vertrag?",
      "hint": "Nur relevant, wenn M10F4 = Ja; sonst mit Nein und dem Hinweis «nicht relevant» beantworten. Externe Zugriffe brauchen einen eigenen Eintrittspunkt (Gateway), eine eigene Identitätsquelle und vertragliche Grundlage — nicht das Mitarbeitenden-IAM."
    },
    {
      "id": "AM6",
      "themeId": "idm-iam",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist dieses IAM-Muster (Federation, Rollenmodell) als Referenz-Vorgabe für Folgeprojekte dokumentiert?",
      "hint": "Wegweisende Projekte setzen das Muster für Folgeprojekte — ein neuer Federation-Weg oder ein neues Rollenmodell wird faktisch zur Vorgabe. Dann muss es als solche dokumentiert und freigegeben sein, nicht nur im Projekt beschrieben."
    },
    {
      "id": "AM7",
      "themeId": "idm-iam",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist die Einstufung/Spezifikation dieses Themas durch das Architektur-Board abgenommen?",
      "hint": "Nur bei wegweisenden Projekten. Traktandum/Protokoll-Referenz in den Bemerkungen festhalten."
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
      "hint": "Beispiele: AWS, Azure, GCP. Eigenständiges Gate, unabhängig von M10D1 — auch relevant, wenn ein bereits bestehender Hyperscaler-Bezug ausgeweitet wird und dies für sich allein evtl. nicht als «neuer» Dienst im engeren Sinn von M10D1 gelesen würde. Hyperscaler-Nutzung ist regulatorisch (FINMA-Outsourcing-Vorgaben, Datenresidenz, Sub-Outsourcing-Ketten) besonders prüfrelevant und wird darum unabhängig erfasst. Bei Ja: Cloud-Art in M10D3 entsprechend als Public/Multi-Tenant oder Hybrid einstufen."
    },
    {
      "id": "C2",
      "text": "Private Cloud oder Public/Multi-Tenant Cloud?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure",
      "kind": "choice",
      "options": [
        "Private Cloud (dedizierter Betrieb bei einem einzelnen Anbieter)",
        "Public/Multi-Tenant Cloud (Hyperscaler, z. B. AWS, Azure, GCP)",
        "Hybrid / gemischt"
      ],
      "hint": "Private Cloud = dedizierter Betrieb bei einem einzelnen Anbieter. Public/Multi-Tenant Cloud = Hyperscaler (z. B. AWS, Azure, GCP). Nur relevant, wenn C1 = Ja. Bei Public/Multi-Tenant Cloud sind Datenresidenz, Shared-Responsibility-Modell und ggf. Bankkundengeheimnis-/Outsourcing-Vorgaben (FINMA-Rundschreiben) besonders zu prüfen; bei Private Cloud primär die vertragliche/betriebliche Kontrolle über die Plattform. Fliesst nicht in die Ja/Nein-Relevanzableitung ein (nur C1 ist Gate-Frage) — dient der direkten Sichtbarkeit der Cloud-Art im M10."
    },
    {
      "id": "C3",
      "text": "Ist die Plattform wie in M20 spezifiziert umgesetzt und vom Betreiber abgenommen — Zielarchitektur, Verantwortung je Komponente, Sizing?",
      "milestone": "M40",
      "themeId": "cloud-infrastructure",
      "hint": "Abgleich mit M20D1–M20D4: Läuft die Lösung auf der spezifizierten Plattform (Cluster, Standort, dediziert/geteilt, Umgebungen), ist die Zielarchitektur des Betreibers in der abgenommenen Fassung dokumentiert, sind alle Komponenten mit Verantwortung besetzt, entspricht das Sizing dem erhobenen Mengengerüst. Abweichungen = Condition."
    },
    {
      "id": "CI8",
      "themeId": "cloud-infrastructure",
      "milestone": "M40",
      "text": "Wurden Ausfall einer Komponente und Wiederherstellung (RTO/RPO) vor Produktivsetzung getestet?",
      "hint": "Der Nachweis zu M20D5 (Ausfall einer Komponente) und M20D6 (RTO/RPO): einmaliger Test vor PROD mit Protokoll — Failover, Restore aus Backup, Wiederaufbau. Die laufende Betriebsroutine (regelmässige Restore-Tests, Backup-Überwachung) ist Betrieb M40G4."
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
      "id": "CI1",
      "text": "Welche Zielplattform ist vorgesehen — Betreiber, Plattform/Cluster, Standort, dediziert oder geteilt, Umgebungen (DEV/TST/PROD)?",
      "milestone": "M20",
      "themeId": "cloud-infrastructure",
      "hint": "Das Cloud-Modell (Private / Public / Hybrid) ist in M10D3 erfasst — hier das Konkrete: wer betreibt, auf welcher Plattform (z. B. Kubernetes-Cluster, VM-Umgebung, SaaS), an welchem Standort, dediziert oder mit anderen geteilt, und welche Umgebungen es gibt. Ist die Zielplattform noch offen, ist das ein offener Punkt für den OnePager, keine Annahme.",
      "kind": "text",
      "remarksAlwaysOpen": true
    },
    {
      "id": "CI2",
      "text": "Liegt eine dokumentierte Zielarchitektur der Infrastruktur vor, die vom Betreiber bestätigt und von der Architektur geprüft ist?",
      "milestone": "M20",
      "themeId": "cloud-infrastructure",
      "hint": "Bei Fremdbetrieb definiert der Betreiber die Zielarchitektur — die Architektur prüft sie gegen die Vorgaben (dieses Factsheet, Thema Datenhaltung, Security). Ein High-Level-Zielbild des Herstellers ersetzt die betreiberseitige Architektur nicht."
    },
    {
      "id": "CI3",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "text": "Ist für jede Plattformkomponente geklärt, wer sie bereitstellt, betreibt und patcht (Hersteller / Betreiber / Bank) — und welche Sicherheitsanforderungen das Vorhaben von der Plattform erbt bzw. selbst umsetzt?",
      "hint": "Beistellpflichten des Betreibers (z. B. Container-Plattform, Datenbanken, Messaging, Suche, Observability, Prozess-Engine), Zuständigkeit für Major- und Minor-Patches, Verantwortung für die Verfügbarkeit jeder Komponente. Unklare Zuständigkeit ist eine Condition, kein Detail für später. Zur Verantwortung gehört auch die Zuordnung der Sicherheits- und Datenschutzanforderungen: Welche Massnahmen erbt das System von Plattform, Betreiber oder Organisation (Common Controls), welche muss es selbst umsetzen?"
    },
    {
      "id": "CI4",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "text": "Beruht das Sizing (Mengengerüst, Ressourcen, Replikas) auf erhobenen Zahlen statt auf Annahmen, mit geklärtem Nachforderungsweg?",
      "hint": "Mengengerüst der Bank (Benutzer, Volumen, Spitzenlast) erhoben und mit den Annahmen der Offerte abgeglichen; Speicherbedarf beziffert; Mechanismus für Nachforderungen (Consumption-Modell, RfC) bekannt. Die laufende Überwachung von Kapazität und Kosten ist M40D3."
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
      "text": "Sind Wiederherstellungsziele (RTO/RPO) definiert und vom Betreiber in einem DR-Konzept bestätigt?",
      "source": "AWS Well-Architected, Reliability",
      "hint": "Hier geht es um die Ziele je Komponente und ein vom Betreiber bestätigtes Konzept — der Test vor Produktivsetzung ist M40D2, die Betriebsroutine M40G4. Ob und wo die Daten je Schutzklasse gesichert sind, ist Thema Datenhaltung (M20B12). Herstellerseitige Rahmenwerte («als Hilfestellung») sind kein DR-Konzept."
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
      "id": "CI6",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist geklärt, ob die Plattform von Folgeprojekten wiederverwendet werden soll — und was das voraussetzt (Lizenz, Mandantenfähigkeit, Kapazität, Betrieb)?",
      "hint": "Wegweisende Projekte schaffen oft die Plattform für weitere Vorhaben. Dann muss jetzt geklärt sein: Lizenzmodell (gilt die Lizenz nur für dieses Vorhaben?), Mandanten-/Mehrbankfähigkeit, Kapazitätsreserve, wer die Plattform als Produkt weiterbetreibt. Ohne diese Klärung entsteht faktisch eine Plattform, die keiner besitzt."
    },
    {
      "id": "CI7",
      "themeId": "cloud-infrastructure",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist die Einstufung/Spezifikation dieses Themas durch das Architektur-Board abgenommen?",
      "hint": "Nur bei wegweisenden Projekten. Traktandum/Protokoll-Referenz in den Bemerkungen festhalten."
    },
    {
      "id": "E1",
      "kind": "text",
      "text": "Um welche Datenhaltung geht es?",
      "hint": "Name und Ort des Bestands, z. B. Applikation, Datenbank, SaaS-Lösung. Grundlagen im Thema Datenhaltung (Info-Icon). Auch App-Daten, Backup und Logs als eigene Datenhaltung erfassen, wenn sie unterschiedlich eingestuft werden könnten (z. B. Logs mit eigener CID-/Aufbewahrungsfrist gegenüber den Primärdaten).",
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
      "hint": "Höher z. B. durch Aggregation/Zusammenführung mehrerer Klassen, tiefer z. B. bei Anonymisierung/Pseudonymisierung. Begründung bei der Schutzklassen-Frage unten festhalten, falls Ja.",
      "id": "E3",
      "milestone": "M20",
      "text": "Weicht die Schutzklasse dieser Datenhaltung von der Projekt-Einstufung (M10A5) ab?",
      "themeId": "data-storage"
    },
    {
      "hint": "Verstärkerfrage, nur ab Grundklasse K2 (gemäss M10A5) beantworten.",
      "id": "E4",
      "milestone": "M20",
      "text": "Entstehen diese Daten hier, statt aus einem anderen System zu stammen?",
      "themeId": "data-storage"
    },
    {
      "hint": "Verstärkerfrage: mindestens ein Ja → eine Stufe höher, höchstens eine. K4 bleibt K4.",
      "id": "E5",
      "milestone": "M20",
      "text": "Bewegt sich Geld oder ändert sich eine Berechtigung oder ein Vertrag, wenn hier jemand unbemerkt Daten verändert?",
      "themeId": "data-storage"
    },
    {
      "hint": "Verstärkerfrage, nur ab Grundklasse K2 (gemäss M10A5) beantworten.",
      "id": "E6",
      "milestone": "M20",
      "text": "Steht das Kerngeschäft still, wenn diese Daten nicht mehr verfügbar sind?",
      "themeId": "data-storage"
    },
    {
      "hint": "Ausgangspunkt ist die Schutzklasse aus M10 (Datenklassifikation, M10A5), angepasst durch die Abweichungs- und Verstärkerfragen oben (M20B3–M20B6). Bei «Weiss nicht» gilt die nächsthöhere plausible Klasse, sonst «nicht beurteilbar». Eine bewusst zu tiefe Einstufung ist nicht zulässig.",
      "id": "E7",
      "kind": "choice",
      "milestone": "M20",
      "options": [
        "K0",
        "K1",
        "K2",
        "K3",
        "K4",
        "nicht beurteilbar"
      ],
      "text": "Welche Schutzklasse ergibt sich (K0–K4)?",
      "themeId": "data-storage"
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
      "hint": "Bei Referenz-/Pilotcharakter dient diese Datenhaltung als Vorlage für spätere Projekte — die getroffene Wahl sollte entsprechend als Vorgabe festgehalten werden, nicht nur als Einzelfallentscheid.",
      "id": "T7",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist dieses Datenhaltungsmuster (Ort/Cloud-Modell/Backup) als Referenz-Vorgabe für Folgeprojekte dokumentiert?",
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
      "hint": "Nur bei wegweisenden Projekten. Traktandum/Protokoll-Referenz in den Bemerkungen festhalten.",
      "id": "R5",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist die Einstufung/Spezifikation dieses Themas durch das Architektur-Board abgenommen?",
      "themeId": "data-storage"
    },
    {
      "id": "cat-nist-p13",
      "themeId": "data-storage",
      "milestone": "M20",
      "text": "Ist der Lebenszyklus jeder Informationsart beschrieben — Entstehung, Verarbeitung, Speicherung, Übermittlung, Archivierung, Löschung?",
      "hint": "Ergänzt die Fragen zu Ort, Backup und Exporten um die zeitliche Dimension: Wie lange bleiben Daten, wann und wie werden sie archiviert und gelöscht, auch in Kopien und Exporten (M20B17). Original: Identify and understand all stages of the information life cycle for each information type processed, stored, or transmitted by the system.",
      "source": "NIST SP 800-37 Rev. 2, RMF Prepare, Task P-13 (Information Life Cycle)"
    },
    {
      "id": "cat-dc1",
      "themeId": "data-classification",
      "milestone": "M20",
      "text": "Sind alle Datenkategorien des Vorhabens inventarisiert und klassifiziert?",
      "source": "BSI IT-Grundschutz, CON.2 / Datenschutz",
      "hint": "Alle Informationsarten, die das System verarbeitet, speichert oder übermittelt. Auch Kopien/Repliken ausserhalb des Kernsystems zählen als eigener Datenspeicher (inkl. CID-Relevanz erfassen). Betrifft insb. Read-Replicas/Caches (z. B. MongoDB-Golden-Record ohne Fallback auf den Core) — dort ist Datenverlust nicht durch das Kernsystem abgesichert."
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
      "hint": "Bei wegweisenden Projekten dient die Einstufung als Präzedenzfall für Folgeprojekte — ein Fehler hier wirkt entsprechend weiter.",
      "id": "D3",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Wurde die Schutzklassen-Herleitung durch eine zweite qualifizierte Stelle (Security/Datenschutz) gegengeprüft?",
      "themeId": "data-classification"
    },
    {
      "hint": "Nur bei wegweisenden Projekten. Traktandum/Protokoll-Referenz in den Bemerkungen festhalten.",
      "id": "cat-dc3",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist die Einstufung/Spezifikation dieses Themas durch das Architektur-Board abgenommen?",
      "themeId": "data-classification"
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
      "text": "Liegt ein aktuelles Kontextdiagramm mit Systemgrenze und allen Nachbarsystemen vor?",
      "source": "arc42, Kapitel 3 (Kontextabgrenzung)",
      "hint": "Idealerweise aus LeanIX generiert bzw. dort erfasst — dann ist M40C1 später ein Abgleich statt eine Nacherfassung. Die Systemgrenze legt fest, welche Komponenten zum System gehören und welche ausserhalb liegen — Nachbarsysteme, Plattformdienste, Lieferanten."
    },
    {
      "id": "cat-nist-p18",
      "themeId": "integration-application",
      "milestone": "M20",
      "text": "Ist das System im Applikationsportfolio registriert (z. B. LeanIX: Applikations-Factsheet angelegt, Verantwortliche eingetragen)?",
      "hint": "Registrierung schon bei der Spezifikation — die Nachführung auf den Stand der Umsetzung prüft M40C1. Original: Register the system with organizational program or management offices.",
      "source": "NIST SP 800-37 Rev. 2, RMF Prepare, Task P-18 (System Registration)"
    },
    {
      "hint": "Bei Referenz-/Pilotcharakter dient dieses Muster als Vorlage für spätere Projekte — die getroffene Wahl sollte entsprechend als Vorgabe festgehalten werden, nicht nur als Einzelfallentscheid.",
      "id": "IA3",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist dieses Integrationsmuster als Referenz-Vorgabe für Folgeprojekte dokumentiert?",
      "themeId": "integration-application"
    },
    {
      "hint": "Nur bei wegweisenden Projekten. Traktandum/Protokoll-Referenz in den Bemerkungen festhalten.",
      "id": "IA4",
      "milestone": "M20",
      "minClassification": "wegweisend",
      "text": "Ist die Einstufung/Spezifikation dieses Themas durch das Architektur-Board abgenommen?",
      "themeId": "integration-application"
    },
    {
      "id": "IA40-1",
      "themeId": "integration-application",
      "milestone": "M40",
      "text": "Sind Applikation und Schnittstellen in LeanIX nachgeführt und auf dem Stand der Umsetzung — Applikations-Factsheet, Interfaces, IT-Komponenten, Verantwortliche?",
      "hint": "LeanIX ist die Referenz, nicht eine Projektliste: jede produktive Schnittstelle ist als Interface erfasst (Quelle, Ziel, Datenobjekte, Versionierung gemäss M20C2), die eingesetzten Technologien als IT-Komponenten, Verantwortliche und Lifecycle gesetzt. Abgleich mit M20C1 (Zielarchitektur) und M20C4 (Kontextdiagramm). Schnittstellen, die während der Realisierung dazukamen, sind der Normalfall — deshalb die Frage. Nachführung durch die Architektur (kein separater EA-Prozess) — deshalb vor der Freigabe selbst erledigen, nicht als Auflage weiterreichen."
    },
    {
      "id": "IA40-2",
      "themeId": "integration-application",
      "milestone": "M40",
      "text": "Wurde die Integration unter Last und beim Ausfall eines Nachbarsystems getestet?",
      "hint": "Lasttest gegen das Mengengerüst (M20D4) über die ganze Kette, nicht nur einzelne Komponenten; Ausfall-/Degradationsverhalten je kritischer Nachbar (Kernsystem, Messaging, IdM): Was sieht der Benutzer, was passiert mit Daten in Bewegung. Ergebnisse und Restrisiken in den Bemerkungen."
    },
    {
      "id": "DO1",
      "text": "Ist die Architekturdokumentation auf dem Stand der umgesetzten Lösung — Zielarchitektur, Schnittstellen, Datenhaltung, Betrieb?",
      "milestone": "M40",
      "themeId": "documentation",
      "hint": "Nicht «gibt es Dokumentation», sondern «stimmt sie mit dem überein, was läuft». Abgleich mit M40C1 (LeanIX), M40D1 (Plattform), M40B1 (Datenhaltung), M40G2 (Betriebshandbuch). Herstellerdokumentation ersetzt die eigene Lösungsdokumentation nicht — die bankspezifische Konfiguration und Integration muss beschrieben sein."
    },
    {
      "id": "DO2",
      "text": "Sind die wesentlichen Architekturentscheide nachvollziehbar festgehalten — Entscheid, Alternativen, Begründung, Datum (ADR oder gleichwertig)?",
      "milestone": "M40",
      "themeId": "documentation",
      "hint": "Mindestens die Entscheide, die in M20 zu Conditions oder Board-Traktanden geführt haben, und alle Abweichungen von Vorgaben mit Risikoakzeptanz. Form ist zweitrangig (ADR, Protokoll, OnePager-Bemerkung), Auffindbarkeit nicht."
    },
    {
      "id": "cat-do1",
      "themeId": "documentation",
      "milestone": "M40",
      "text": "Ist die Dokumentation in LeanIX verankert — Applikations-Factsheet mit Verknüpfung zur Lösungsdokumentation und zu den Architekturentscheiden?",
      "source": "arc42 / LeanIX",
      "hint": "Vorläufige Referenz, solange keine Struktur- und Ablagevorgabe besteht: Wer die Applikation in LeanIX findet, findet von dort die Dokumentation. Sobald eine Vorgabe existiert (z. B. arc42-Gliederung, Dokumentablage), hier zusätzlich deren Einhaltung prüfen."
    },
    {
      "id": "U1",
      "milestone": "M40",
      "themeId": "data-storage",
      "text": "Sind Ort, Backup-Ort, Logs und Exporte dieser Datenhaltung im Betrieb so, wie in M20 spezifiziert und für die Schutzklasse zulässig?",
      "hint": "Abgleich der M20-Angaben (M20B8–M20B13) mit dem tatsächlichen Betrieb: Wo liegen die Daten und Backups wirklich, was steht in den Logs, welche Exporte laufen. Abweichung = Condition mit Termin, bei K4 Ausnahmeentscheid. Die regelmässigen Restore-Tests sind Betriebsroutine (M40G4).",
      "source": "Architekturprüfmodell, MS40 (Überprüfung)"
    },
    {
      "id": "cat-ci4",
      "themeId": "cloud-infrastructure",
      "milestone": "M40",
      "text": "Werden Kapazität und Kosten der Zielumgebung laufend überwacht?",
      "source": "AWS Well-Architected, Cost Optimization",
      "hint": "Schliesst die Sizing-Annahmen aus M20D4: Auslastung gegen das Mengengerüst, Kosten gegen die Offerte; der Nachforderungsweg (Consumption-Modell, RfC) ist im Betrieb etabliert."
    },
    {
      "id": "AM1",
      "text": "Sind Rollen und Berechtigungen wie im Konzept beschrieben umgesetzt und abgenommen?",
      "milestone": "M40",
      "themeId": "idm-iam",
      "hint": "Abgleich Konzept (M20F2) gegen die produktive Konfiguration: Rollen, Zuordnungen, technische Konten. Abweichungen als Condition mit Termin."
    },
    {
      "id": "cat-am3",
      "themeId": "idm-iam",
      "milestone": "M40",
      "text": "Werden Berechtigungen regelmässig überprüft und rezertifiziert?",
      "source": "BSI IT-Grundschutz, ORP.4"
    },
    {
      "id": "cat-nist-p14",
      "themeId": "technical-debt",
      "milestone": "M20",
      "text": "Liegt eine systembezogene Risikobeurteilung vor — identifizierte Risiken, Priorisierung, Massnahmen — und wird sie im Projektverlauf nachgeführt?",
      "hint": "Die Risiken aus dieser Beurteilung sind die Grundlage für Conditions und Risikoakzeptanzen; M40I3 prüft, ob alle offenen Conditions erfasst oder geschlossen sind. Original: Conduct a system-level risk assessment and update the risk assessment results on an ongoing basis.",
      "source": "NIST SP 800-37 Rev. 2, RMF Prepare, Task P-14 (Risk Assessment – System)"
    },
    {
      "id": "cat-td1",
      "themeId": "technical-debt",
      "milestone": "M40",
      "text": "Sind die bekannten technischen Schulden erfasst und mit Aufwand und Risiko bewertet?",
      "source": "aim42 (Improve)",
      "hint": "Alles, was bewusst nicht gelöst wurde: Abweichungen von Vorgaben, Provisorien, ausgeschlossene Leistungen (z. B. nicht durchgeführte Tests), bekannte Lücken in Betrieb oder Dokumentation. Je Eintrag: Auswirkung, Risiko, grober Behebungsaufwand."
    },
    {
      "id": "TD2",
      "themeId": "technical-debt",
      "milestone": "M40",
      "kind": "choice",
      "options": [
        "keine",
        "Low",
        "Medium",
        "High"
      ],
      "remarksAlwaysOpen": true,
      "text": "Wie hoch ist der Aufwand zur Behebung der technischen Schulden gesamthaft?",
      "hint": "Grobe Einordnung für den OnePager und die Portfolio-Sicht: Low = im laufenden Betrieb erledigbar, Medium = eigenes Arbeitspaket, High = eigenes Projekt oder Budgetantrag. Begründung in den Bemerkungen."
    },
    {
      "id": "TD3",
      "themeId": "technical-debt",
      "milestone": "M40",
      "text": "Sind alle offenen Conditions aus M10–M40 mit Verantwortlichem und Termin erfasst — oder mit dokumentierter Risikoakzeptanz geschlossen?",
      "hint": "Die Bilanz über alle Themen: jede Condition hat entweder Owner und Termin oder eine Risikoakzeptanz der zuständigen Entscheidungsebene. Eine Condition ohne beides ist keine Condition, sondern ein vergessenes Risiko. Ergebnis gehört in die Zeile Risiken/Conditions des OnePagers."
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
      "hint": "Aus M10A1/M10A2/M10A3/M10A4 abgeleitet: M10A1 Nein → K0. M10A1 Ja → mindestens K1, M10A2 Ja → mindestens K2. M10A3 Ja → mindestens K3. M10A4 Ja → K4. Bei Unklarheit: «nicht beurteilbar».",
      "remarksAlwaysOpen": true
    },
    {
      "id": "DC40",
      "themeId": "data-classification",
      "milestone": "M40",
      "text": "Ist die Schutzklasse (M10A5) auf dem Stand der umgesetzten Lösung — keine neuen Datenkategorien oder Verarbeitungszwecke, die die Herleitung ändern?",
      "hint": "Vor Produktivsetzung prüfen, ob der Dateninhalt noch dem entspricht, was in M10 beurteilt wurde. Bei Änderung: Herleitung (M10A1–M10A4) wiederholen, Abweichung in Datenhaltung (M20B3) nachziehen, Security informieren. Ergebnis mit Datum in den Bemerkungen."
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
      "hint": "Abgrenzung zu M10F2: M10F2 betrifft die Anbindung interner Nutzer (Mitarbeitende) an IdM/IAM, diese Frage den Zugriff von ausserhalb der eigenen Organisation. Bei Ja: eigenes Bedrohungsmodell, WAF-/API-Gateway-Härtung sowie vertragliche/regulatorische Fragen (z. B. Open-Banking/TPP-Szenarien) zusätzlich prüfen."
    },
    {
      "id": "SC0",
      "text": "Entstehen neue oder wesentlich veränderte Schnittstellen nach aussen?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Z. B. neue externe Integrationen, neue Identity-/Access-Anbindungen. Löst bei Ja die Fragen zur Netzwerkzonierung (M20E4) und zur Bedrohungsanalyse (M20E2) aus. Entwurf — Kriterien mit der Fachstelle Security & Compliance abstimmen."
    },
    {
      "id": "SC2",
      "text": "Entsteht neue oder wesentlich veränderte Datenverarbeitung?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Z. B. neue Datenflüsse, neue Speicherorte/-systeme, neue Verarbeitungszwecke. Löst bei Ja Bedrohungsanalyse und Sicherheitsanforderungen aus (M20E2, M20E3). Entwurf — Kriterien mit der Fachstelle Security & Compliance abstimmen."
    },
    {
      "id": "SC3",
      "text": "Bestehen regulatorische Anforderungen an das Vorhaben?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Z. B. FINMA-Vorgaben, DSG. Löst bei Ja die Prüfung der regulatorischen Anforderungen aus (M20E1) und ist der Anhaltspunkt für den Kontrollpunkt «FINMA-Prüfung erforderlich» in der M20-Abnahme. Entwurf — Kriterien mit der Fachstelle Security & Compliance abstimmen."
    },
    {
      "id": "SC12",
      "themeId": "security-compliance",
      "milestone": "M40",
      "text": "Liegen die vor Produktivsetzung verlangten Security-Nachweise vor (z. B. Pentest, Security-Audit) und sind die Auflagen erfüllt?",
      "hint": "Welche Nachweise vor PROD verlangt sind, ergibt sich aus den regulatorischen Anforderungen (M20E1) und den Sicherheitsanforderungen (M20E3) — z. B. Pentest, Security-Audit. Nachweise, die erst auf einer Testumgebung möglich sind, gehören als Auflage mit Gate vor die Produktivsetzung.",
      "remarksAlwaysOpen": true
    },
    {
      "id": "SC16",
      "themeId": "security-compliance",
      "milestone": "M40",
      "remarksAlwaysOpen": true,
      "text": "Sind die in M20 spezifizierten Sicherheitsmassnahmen umgesetzt und belegt — Zonierung, Verschlüsselung, Schwachstellen-Scan — und sind Abweichungen als Conditions erfasst?",
      "hint": "Nachweis je Massnahme aus M20E4 bis M20E6: Konfiguration, Scan-Report, Abnahmeprotokoll. Abweichungen mit Verantwortlichem und Termin, geschlossen über M40I3."
    },
    {
      "id": "cat-sc2",
      "themeId": "security-compliance",
      "milestone": "M40",
      "text": "Ist das System in den Security-Incident-Prozess eingebunden — Meldewege, Ansprechpersonen, Meldepflichten gegenüber der FINMA?",
      "hint": "Abgrenzung zu M40G3 (technische Alarmierung): Hier geht es um den organisatorischen Umgang mit Sicherheitsvorfällen inklusive Meldepflicht bei Cyberangriffen — wer meldet, wer entscheidet, wer kommuniziert.",
      "source": "AWS Well-Architected, Security / FINMA-RS 2023/1"
    }
  ],
  "classificationInfoMd": "# Klassifikation\n\nDie Klassifikation ist das Ergebnis der Foundation-Prüfung (M10) und Teil\nder Freigabe:\n\n- **nicht relevant** — alle Relevanz-Fragen sind mit Nein beantwortet.\n  Es findet keine weitere Architekturprüfung statt (kein M20/M40).\n- **relevant** — das Projekt berührt die Architektur; die Fragenkataloge\n  M20 und M40 werden geprüft.\n- **wegweisend** — das Projekt prägt die Architektur; zusätzlich werden\n  die als «ab wegweisend» markierten Fragen gestellt.\n\nOb ein Projekt architekturrelevant ist, ergibt sich automatisch aus den\nJa/Nein-Fragen im M10 (mindestens eine Frage mit Ja → relevant; alle Nein\n→ nicht relevant).\n\nOb ein relevantes Projekt zusätzlich **wegweisend** ist, entscheidet\nder/die Architekt/in anhand folgender Kriterien (mindestens eines trifft zu):\n\n- **Referenz-/Pilotcharakter** — das Projekt führt ein Muster, eine\n  Technologie oder eine Plattform ein, die anschliessend als Vorlage für\n  weitere Projekte dient.\n- **Wirkung über das Projekt hinaus** — Entscheide betreffen mehrere\n  Systeme, mehrere Mandanten/Banken oder die gemeinsame Plattform, nicht\n  nur die Applikation des Projekts selbst.\n- **Abweichung von bestehenden Vorgaben** — das Projekt weicht bewusst von\n  einem etablierten Standard ab, und diese Abweichung soll künftig als\n  Präzedenzfall/neue Richtlinie gelten (nicht nur als Einzelfall-Ausnahme).\n- **Hohe Tragweite bei Fehlentscheid** — Risiko, Kosten oder regulatorische\n  Sichtbarkeit sind so hoch, dass ein Fehler in der Architekturprüfung\n  überproportionalen Schaden anrichten würde.\n",
  "milestoneChecks": [
    {
      "id": "finma-relevant",
      "milestone": "M20",
      "label": "FINMA-Prüfung",
      "hint": "FINMA-Prüfung erforderlich, wenn (a) das Vorhaben eine wesentliche Änderung der Systemlandschaft ist — FINMA-RS 2023/1 Rz 32: «Vor wesentlichen Änderungen in den Produkten, Aktivitäten, Prozessen und Systemen sind ad hoc Risiko- und Kontrollbeurteilungen durchzuführen. Diese berücksichtigen die mit dem Änderungsprozess einhergehenden operationellen Risiken und die operationellen Risiken des Zielzustands.» — oder (b) Outsourcing-Relevanz besteht — FINMA-RS 2018/3 Rz 2/3: Ein Outsourcing liegt vor, wenn ein Dienstleister beauftragt wird, selbständig und dauernd eine für die Geschäftstätigkeit wesentliche Funktion ganz oder teilweise zu erfüllen; wesentlich sind Funktionen, von denen die Einhaltung der Ziele und Vorschriften der Finanzmarktaufsichtsgesetzgebung signifikant abhängt."
    },
    {
      "id": "new-supplier-check",
      "milestone": "M20",
      "label": "Lieferanten-Prüfung",
      "hint": "Falls neuer Lieferant: to be defined — Umfang und Ablauf der Lieferanten-Prüfung folgen aus der Abstimmung mit der Fachstelle Security & Compliance."
    }
  ],
  "company": "MyCompany"
};
