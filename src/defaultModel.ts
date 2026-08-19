import { Model } from './types';

// Standard-Katalog: wird als model.json angelegt, wenn die Datei im
// gewählten Ordner fehlt. Dient auch als Fallback, wenn eine bestehende
// model.json (noch) keine Fragen enthält.
// GENERIERT aus sample-data/model.json — dort ändern und neu generieren.
export const DEFAULT_MODEL: Model = {
  "version": 3,
  "company": "Eigene Firma",
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
      "infoMd": "# Factsheet Datenklassifikation\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nEinstufung der Daten (z. B. SCHUBAN) und daraus abgeleitete Datenhaltungsvorgaben (Schutzbedarfsanalyse).\n\n## Vorgaben\n\n- Schutzbedarfsanalyse durchführen (SCHUBAN)\n- Einstufung dokumentieren\n- Ableitung der Datenhaltungsvorgaben → Factsheet Datenhaltung\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "data-storage",
      "title": "Datenhaltung",
      "infoMd": "# Factsheet Datenhaltung\n\n*Version 0.3 · 04.08.2026 · Tim Känzig · Status: In Prüfung (ehemals «Leitlinie Datenhaltungsvorgaben»)*\n\n## Zweck\n\nDieses Factsheet legt fest, wo Daten je Schutzklasse gehalten werden dürfen und wo deren Backups liegen dürfen. Es dient dem Nachschlagen. Das Prüfformular ist ein eigenes Dokument («Prüfformular Datenhaltung») und wird je Projekt ausgefüllt.\n\nEs gilt für neue oder geänderte Datenhaltungen in Projekten, Applikationen, Plattformen, Cloud- und SaaS-Lösungen, Datenbanken, Dateiablagen, Reporting-Umgebungen, Exporten, Caches und Backups.\n\nZur Datenhaltung gehören auch Bestände, an die man zuerst nicht denkt:\n\n- Reporting- und Auswertungsbestände\n- Logs und Monitoringdaten, sofern sie Personendaten, Tokens oder Secrets enthalten\n- persistente Caches, die Daten über die Verarbeitung hinaus behalten\n- prozessual vorgesehene Exporte, etwa ein wiederkehrender Auszug in eine andere Umgebung\n- Testumgebungen mit Produktivdaten\n- Backups und Snapshots\n\n**Keine** Datenhaltung ist die blosse Möglichkeit, Daten zu exportieren. Ein Export zählt erst, wenn der Prozess ihn vorsieht, er regelmässig entsteht oder das Ergebnis abgelegt wird. Ebenso wenig zählen die reine Übertragung und die reine Anzeige ohne Speicherung.\n\nNicht Gegenstand: Löschfristen und Aufbewahrungspflichten, Berechtigungskonzepte, Datenschutzfreigaben, Security-Konzept, Betriebs- und Wiederherstellungskonzepte.\n\n## Schutzklassen\n\n| Klasse | Bedeutung |\n|---|---|\n| K0 Öffentlich | Zur Veröffentlichung bestimmt oder bereits öffentlich |\n| K1 Intern | Intern bestimmt, ohne Personen- oder Kundenbezug |\n| K2 Vertraulich | Daten von Kunden oder Mitarbeitenden ohne besondere Brisanz |\n| K3 Hochvertraulich | Inhalte, deren Offenlegung den Betroffenen ernsthaft schadet |\n| K4 Hochschutz | Daten, mit denen sich unmittelbar handeln lässt |\n\nDer Unterschied zwischen K0 und K1 liegt in der **Bestimmung**, nicht im Schaden. Ein zweckgebundener Datenausschnitt kann tiefer eingestuft werden als der vollständige, führende Bestand — massgebend sind Inhalt und Rolle im Systemverbund, nicht die Zahl der Betroffenen.\n\n## Grundprinzipien\n\n- Massgebend ist der **Inhalt** der Datenhaltung, weder der Name der Applikation noch die Personengruppe.\n- Die **höchste zutreffende Klasse** gilt für die gesamte Datenhaltung.\n- Liegt die Datenhaltung an mehreren Orten, gilt der **strengste Fall**.\n- Kopien, Exporte, Reporting-Bestände, Caches, Backups und Restore-Ziele **übernehmen die Klasse** der enthaltenen Daten.\n- **Unklarheit ist kein zulässiges Ergebnis**: Fehlen Angaben, lautet das Ergebnis «nicht beurteilbar», nicht «in Ordnung».\n- Labels, DLP, Verschlüsselung und Monitoring unterstützen, ersetzen aber weder Einstufung noch zulässigen Ort.\n\n## Vorgaben je Schutzklasse\n\nGrundlage für die Felder R1 bis R3 im Prüfformular. Die Anforderungen sind kumulativ.\n\n| Klasse | Zulässige Datenhaltung | Logs und Monitoring | Kopien und Exporte |\n|---|---|---|---|\n| K0 | Kein zwingender Datenraum | Normales Betriebsmonitoring | Keine Einschränkung |\n| K1 | Intern oder Cloud/SaaS, Schweiz als Standard | Normales Betriebsmonitoring | Keine Ablage in persönlichen oder unkontrollierten Bereichen |\n| K2 | Schweiz erforderlich, Cloud/SaaS Schweiz möglich | Monitoring erforderlich, keine Nutzdaten, Secrets oder Tokens in Logs | Nur zweckgebunden |\n| K3 | Schweiz und restriktiv kontrollierter Ort | Zusätzlich nachvollziehbare Protokollierung | Nur wenn fachlich notwendig |\n| K4 | Private Cloud oder dedizierter Hochschutz-Ort Schweiz | Zusätzlich auditierbare Protokollierung | Grundsätzlich zu vermeiden |\n\nFür K0 keine verbindliche Ortsvorgabe. Für K1 gilt die Schweiz als Standard; eine Abweichung vom Standardort allein ist keine Condition.\n\n## Abweichungen und Risikoakzeptanz\n\nDie Architektur bewertet die Abweichung, die Risikoakzeptanz erfolgt durch die zuständige Entscheidungsebene.\n\n| Situation | Erwartete Behandlung |\n|---|---|\n| Abweichung bei K2 oder K3 | Risikoanalyse und dokumentierte Risikoakzeptanz |\n| Abweichung bei K4 | Grundsätzlich nicht zulässig, es braucht eine explizite Ausnahmeentscheidung |\n| Ort nicht belegbar oder Zugriff aus dem Ausland unklar | Nicht beurteilbar, bis ein Nachweis vorliegt |\n"
    },
    {
      "id": "integration-application",
      "title": "Integrations- und Applikationsarchitektur",
      "infoMd": "# Factsheet Integrations- und Applikationsarchitektur\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nPrüfung der Integrations- und Applikationsarchitektur des Vorhabens.\n\n## Vorgaben\n\n- Kontextdiagramm als Lieferobjekt (Architektur, 2 PT)\n- Einhaltung der Integrationsmuster\n- Abgrenzung zu bestehenden Applikationen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "cloud-infrastructure",
      "title": "Cloud- und Infrastrukturarchitektur",
      "infoMd": "# Factsheet Cloud- und Infrastrukturarchitektur\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nPrüfung der Cloud- und Infrastrukturarchitektur des Vorhabens.\n\n## Vorgaben\n\n- Zielumgebung und Plattformwahl\n- Infrastrukturvorgaben\n- Betriebsaspekte der Infrastruktur\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "security-compliance",
      "title": "Security & Compliance",
      "infoMd": "# Factsheet Security & Compliance\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nWird nicht von uns erstellt, sondern zur Erstellung/Prüfung an die zuständige Stelle übergeben; hier nur Verweis und Übergabe.\n\n## Vorgaben\n\n- Übergabe an die zuständige Stelle\n- Ergebnis der externen Prüfung entgegennehmen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "idm-iam",
      "title": "IdM / IAM",
      "infoMd": "# Factsheet IdM / IAM\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nPrüfung von Identity- und Access-Management-Aspekten des Vorhabens.\n\n## Vorgaben\n\n- Rollen und Berechtigungen\n- Anbindung an zentrale IdM/IAM-Dienste\n- Privilegierte Zugriffe\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "operations",
      "title": "Betriebsarchitektur",
      "infoMd": "# Factsheet Betriebsarchitektur\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nBetriebsnahe Prüfung der Lösung (MS40).\n\n## Vorgaben\n\n- Betriebsorganisation\n- Betriebshandbuch und Supportprozesse\n- Backup, Monitoring, Alarmierung\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "documentation",
      "title": "Dokumentation",
      "infoMd": "# Factsheet Dokumentation\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nPrüfung der Architektur- und Lösungsdokumentation (MS40).\n\n## Vorgaben\n\n- Aktualität der Dokumentation\n- Nachvollziehbarkeit der Architekturentscheide\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    },
    {
      "id": "technical-debt",
      "title": "Technische Schulden / Risiken / Conditions",
      "infoMd": "# Factsheet Technische Schulden / Risiken / Conditions\n\n*Dummy — Fachinhalt folgt.*\n\n## Zweck\n\nFesthalten technischer Schulden, Risiken und Conditions inkl. Budget zur Behebung (Low / Med / High).\n\n## Vorgaben\n\n- Technische Schulden erfassen\n- Budget zur Behebung (Low / Med / High)\n- Risiken und Conditions im OnePager nachführen\n\n## Ergebnis für den OnePager\n\nEine Zeile: relevant / geprüft / Ergebnis / Risiken, Conditions, offene Punkte."
    }
  ],
  "questions": [
    {
      "id": "D1",
      "text": "Enthält das Vorhaben Personendaten?",
      "milestone": "M10",
      "themeId": "data-classification",
      "hint": "Dummy-Frage — massgeblich ist die Schutzbedarfsanalyse (SCHUBAN).",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "D2",
      "text": "Enthält das Vorhaben besonders schützenswerte Daten?",
      "milestone": "M10",
      "themeId": "data-classification",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "D3",
      "text": "Welche SCHUBAN-Einstufung ergibt sich?",
      "milestone": "M10",
      "themeId": "data-classification",
      "kind": "choice",
      "hint": "Daraus leiten sich die Datenhaltungsvorgaben ab.",
      "options": [
        "A",
        "B",
        "C"
      ],
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "K1",
      "text": "Liegt die SCHUBAN-Einstufung vor?",
      "milestone": "M20",
      "themeId": "data-classification",
      "hint": "Dummy-Frage — Fachinhalt folgt.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "K2",
      "text": "Sind die abgeleiteten Datenhaltungsvorgaben berücksichtigt?",
      "milestone": "M20",
      "themeId": "data-classification",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "S1",
      "text": "Speichern wir irgendwo Daten neu?",
      "milestone": "M10",
      "themeId": "data-storage",
      "hint": "Was alles als Datenhaltung zählt, steht in der «Factsheet Datenhaltung» (Info-Icon), Abschnitt Zweck.",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 1"
    },
    {
      "id": "S2",
      "text": "Kopieren wir Daten an einen Ort, an dem sie heute nicht liegen?",
      "milestone": "M10",
      "themeId": "data-storage",
      "hint": "Dass ein System einen Export-Knopf hat, zählt nicht.",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 1"
    },
    {
      "id": "S3",
      "text": "Wechselt eine bestehende Datenhaltung den Ort?",
      "milestone": "M10",
      "themeId": "data-storage",
      "hint": "Anderes Land, anderer Anbieter oder andere Plattform.",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 1"
    },
    {
      "id": "S4",
      "text": "Kommen in einer bestehenden Datenhaltung neue Datenarten dazu?",
      "milestone": "M10",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 1"
    },
    {
      "id": "I1",
      "text": "Entstehen neue Schnittstellen zu bestehenden Systemen?",
      "milestone": "M10",
      "themeId": "integration-application",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "I2",
      "text": "Liegt ein aktuelles Kontextdiagramm vor?",
      "milestone": "M10",
      "themeId": "integration-application",
      "hint": "Das Kontextdiagramm ist Lieferobjekt der Architektur.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "I3",
      "text": "Werden die bestehenden Integrationsmuster eingehalten?",
      "milestone": "M10",
      "themeId": "integration-application",
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
      "id": "C1",
      "text": "Werden neue Cloud-Dienste oder Plattformen eingesetzt?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "C2",
      "text": "Entspricht die Zielumgebung den Infrastrukturvorgaben?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "C3",
      "text": "Ist der Betrieb der Infrastruktur (Monitoring, Patching) geklärt?",
      "milestone": "M10",
      "themeId": "cloud-infrastructure",
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
      "id": "SC1",
      "text": "Wurde das Vorhaben der zuständigen Stelle für Security & Compliance übergeben?",
      "milestone": "M10",
      "themeId": "security-compliance",
      "hint": "Dieses Factsheet wird extern erstellt und geprüft.",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "SC2",
      "text": "Liegt das Ergebnis der externen Prüfung vor?",
      "milestone": "M10",
      "themeId": "security-compliance",
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
      "id": "A1",
      "text": "Werden neue Rollen oder Berechtigungen eingeführt?",
      "milestone": "M10",
      "themeId": "idm-iam",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "A2",
      "text": "Erfolgt die Authentifizierung über die zentralen IdM/IAM-Dienste?",
      "milestone": "M10",
      "themeId": "idm-iam",
      "source": "Dummy — Fachinhalt folgt"
    },
    {
      "id": "A3",
      "text": "Sind privilegierte Zugriffe geregelt (Admin, Wartung)?",
      "milestone": "M10",
      "themeId": "idm-iam",
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
      "id": "T1",
      "text": "Sind technische Schulden aus dem Vorhaben erfasst?",
      "milestone": "M40",
      "themeId": "technical-debt",
      "source": "Dummy — Fachinhalt folgt",
      "hint": "Liegen Teile an mehreren Orten (Reporting, Testumgebung, Cache), sind alle zu nennen.",
      "kind": "text"
    },
    {
      "id": "T2",
      "text": "Ist das Budget zur Behebung eingeplant (Low / Med / High)?",
      "milestone": "M40",
      "themeId": "technical-debt",
      "kind": "text",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3",
      "hint": "Eigenes Rechenzentrum, Private Cloud, Public Cloud oder SaaS.",
      "options": [
        "eigenes Rechenzentrum",
        "Private Cloud",
        "Public Cloud",
        "SaaS"
      ]
    },
    {
      "id": "T3",
      "text": "Sind Risiken und Conditions im OnePager nachgeführt?",
      "milestone": "M40",
      "themeId": "technical-debt",
      "source": "Dummy — Fachinhalt folgt",
      "hint": "Vertrag, Regionseinstellung oder schriftliche Herstellerangabe — Beleg in den Bemerkungen festhalten."
    },
    {
      "id": "E1",
      "kind": "text",
      "text": "Um welche Datenhaltung geht es?",
      "hint": "Name und Ort des Bestands, z. B. Applikation, Datenbank, SaaS-Lösung. Grundlagen im Factsheet Datenhaltung (Info-Icon).",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E2",
      "text": "Bleiben die Daten dort liegen (nicht nur Anzeige)?",
      "hint": "Nur Anzeige → keine Datenhaltung; die Prüfung endet hier und wird auf dem OnePager entsprechend eingetragen.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E3",
      "text": "Ist der Inhalt dafür bestimmt, öffentlich zu sein?",
      "hint": "Ja → K0, die Einstufungsfragen entfallen. Massgebend ist die Bestimmung, nicht ob man ihn veröffentlichen könnte.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E4",
      "text": "Geht es in den Daten um bestimmte Personen (Kunden, Mitarbeitende, Partner)?",
      "hint": "Nein → K1, Ja → mindestens K2. Nein heisst: rein interne Inhalte wie Prozessbeschreibungen oder Konfigurationen ohne Passwörter.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E5",
      "text": "Enthalten die Daten Inhalte, die einer betroffenen Person ernsthaft schaden würden, wenn sie nach aussen gelangen?",
      "hint": "Ja → mindestens K3. Gesundheit, Bonität, finanzielle Situation — auch wenn sie nur in Freitextfeldern, Notizen oder Anhängen vorkommen.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E6",
      "text": "Könnte jemand mit diesen Daten unmittelbar handeln (Geld bewegen, sich als jemand anderes ausgeben, Zugang verschaffen)?",
      "hint": "Ja → K4. Konto- und Transaktionsdaten, Zahlungsmittel, Identitätsnachweise, Passwörter, Schlüssel, Administrationszugänge.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E7",
      "text": "Entstehen diese Daten hier, statt aus einem anderen System zu stammen?",
      "hint": "Verstärkerfrage, nur ab Grundklasse K2 beantworten.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E8",
      "text": "Bewegt sich Geld oder ändert sich eine Berechtigung oder ein Vertrag, wenn hier jemand unbemerkt Daten verändert?",
      "hint": "Verstärkerfrage: mindestens ein Ja → eine Stufe höher, höchstens eine. K4 bleibt K4.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E9",
      "text": "Steht das Kerngeschäft still, wenn diese Daten nicht mehr verfügbar sind?",
      "hint": "Verstärkerfrage, nur ab Grundklasse K2 beantworten.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "E10",
      "kind": "choice",
      "text": "Welche Schutzklasse ergibt sich (K0–K4)?",
      "hint": "Bei «Weiss nicht» gilt die nächsthöhere plausible Klasse, sonst «nicht beurteilbar». Eine bewusst zu tiefe Einstufung ist nicht zulässig.",
      "milestone": "M20",
      "themeId": "data-storage",
      "options": [
        "K0",
        "K1",
        "K2",
        "K3",
        "K4",
        "nicht beurteilbar"
      ],
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 2"
    },
    {
      "id": "T1",
      "kind": "text",
      "text": "In welchem Land liegen die Daten?",
      "hint": "Liegen Teile an mehreren Orten (Reporting, Testumgebung, Cache), sind alle zu nennen.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3"
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
      ],
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3"
    },
    {
      "id": "T3",
      "text": "Ist der Datenhaltungsort belegbar?",
      "hint": "Vertrag, Regionseinstellung oder schriftliche Herstellerangabe — Beleg in den Bemerkungen festhalten.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3"
    },
    {
      "id": "T4",
      "text": "Können Personen aus dem Ausland auf die Daten zugreifen?",
      "hint": "Etwa über Anbieter-Support, Subunternehmer, Fernwartung oder Betriebsteams im Ausland. Wird nur festgehalten, ist keine Abweichung.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3"
    },
    {
      "id": "T5",
      "text": "Werden die Daten gesichert?",
      "hint": "Backup-Ort nach Land und Art in den Bemerkungen; das Restore-Ziel zählt dazu.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3"
    },
    {
      "id": "T6",
      "kind": "text",
      "text": "Wie sind Logs, Monitoring und wiederkehrende Exporte geregelt?",
      "hint": "Was wird protokolliert, wo liegen die Protokolle, welche Auszüge verlassen das System regelmässig?",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 3"
    },
    {
      "id": "R1",
      "text": "Passen Datenhaltungsort und Backup-Ort zur Schutzklasse?",
      "hint": "Abgleich gegen die Vorgaben je Schutzklasse im Factsheet Datenhaltung. Nein → Abweichung unten beschreiben.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 4"
    },
    {
      "id": "R2",
      "text": "Passen Logs und Monitoring zur Schutzklasse?",
      "hint": "Nein → Abweichung unten beschreiben.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 4"
    },
    {
      "id": "R3",
      "text": "Passen Kopien und Exporte zur Schutzklasse?",
      "hint": "Nein → Abweichung unten beschreiben.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 4"
    },
    {
      "id": "R4",
      "kind": "text",
      "text": "Abweichungen: Was weicht ab, wer akzeptiert das Risiko (Rolle und Person), bis wann behoben?",
      "hint": "Nur ausfüllen, wenn eine Abgleichfrage mit Nein beantwortet wurde. Solange die Risikoakzeptanz nicht dokumentiert vorliegt, bleibt die Condition offen.",
      "milestone": "M20",
      "themeId": "data-storage",
      "source": "Prüfformular Datenhaltung (V0.3, 04.08.2026), Schritt 4"
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
      "id": "cat-sc2",
      "themeId": "security-compliance",
      "milestone": "M20",
      "text": "Ist ein Prozess für den Umgang mit Security-Incidents definiert?",
      "source": "AWS Well-Architected, Security / FINMA-RS 2023/1"
    },
    {
      "id": "cat-dc1",
      "themeId": "data-classification",
      "milestone": "M20",
      "text": "Sind alle Datenkategorien des Vorhabens inventarisiert und klassifiziert?",
      "source": "BSI IT-Grundschutz, CON.2 / Datenschutz"
    },
    {
      "id": "qoa6a8zcfrq",
      "text": "sdfsdf?",
      "milestone": "M10",
      "themeId": "data-classification",
      "hint": "asdfdddd"
    },
    {
      "id": "cat-ds1",
      "themeId": "data-storage",
      "milestone": "M40",
      "text": "Werden Backups regelmässig durch Restore-Tests verifiziert?",
      "source": "BSI IT-Grundschutz, CON.3 Datensicherungskonzept"
    }
  ],
  "classificationInfoMd": "# Klassifikation\n\n*Dummy — die echten Kriterien folgen.*\n\nDie Klassifikation ist das Ergebnis der Foundation-Prüfung (M10) und Teil\nder Freigabe:\n\n- **nicht relevant** — alle Relevanz-Fragen sind mit Nein beantwortet.\n  Es findet keine weitere Architekturprüfung statt (kein M20/M40).\n- **relevant** — das Projekt berührt die Architektur; die Fragenkataloge\n  M20 und M40 werden geprüft.\n- **wegweisend** — das Projekt prägt die Architektur; zusätzlich werden\n  die als «ab wegweisend» markierten Fragen gestellt.\n\nOb ein Projekt architekturrelevant ist, ergibt sich automatisch aus den\nJa/Nein-Fragen im M10 (mindestens eine Frage mit Ja → relevant; alle Nein\n→ nicht relevant). Ob es **relevant** oder **wegweisend** ist, entscheidet\nder/die Architekt/in.\n"
};
