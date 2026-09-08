import { Question } from './types';

// Fragenkatalog: zusätzliche, thematisch passende Fragen aus etablierten
// Rahmenwerken (paraphrasiert, mit Quellenangabe). Sie sind NICHT automatisch
// aktiv — der Admin übernimmt sie gezielt über die Katalogsuche.
export const CATALOG_QUESTIONS: Question[] = [
  // ── Datenklassifikation ───────────────────────────────────────────────────
  {
    id: 'cat-dc1', themeId: 'data-classification', milestone: 'M20',
    text: 'Sind alle Datenkategorien des Vorhabens inventarisiert und klassifiziert?',
    source: 'BSI IT-Grundschutz, CON.2 / Datenschutz',
  },
  {
    id: 'cat-dc2', themeId: 'data-classification', milestone: 'M20',
    text: 'Ist der Umgang mit besonders schützenswerten Personendaten geregelt?',
    hint: 'Gesundheit, Religion, biometrische Daten usw.',
    source: 'CH-DSG (revidiert), Art. 5',
  },
  // ── Datenhaltung ──────────────────────────────────────────────────────────
  {
    id: 'cat-ds1', themeId: 'data-storage', milestone: 'M40',
    text: 'Werden Backups regelmässig durch Restore-Tests verifiziert?',
    source: 'BSI IT-Grundschutz, CON.3 Datensicherungskonzept',
  },
  // ── Integrations- und Applikationsarchitektur ─────────────────────────────
  {
    id: 'cat-ia1', themeId: 'integration-application', milestone: 'M20',
    text: 'Sind Schnittstellen versioniert und abwärtskompatibel geplant?',
    source: 'TOGAF Architecture Compliance Review (paraphrasiert)',
  },
  {
    id: 'cat-ia2', themeId: 'integration-application', milestone: 'M20',
    text: 'Ist die Fehlerbehandlung über Systemgrenzen definiert (Retry, Idempotenz, Timeouts)?',
    source: 'aim42 / TOGAF Compliance Review',
  },
  {
    id: 'cat-ia3', themeId: 'integration-application', milestone: 'M20',
    text: 'Liegt ein aktuelles Kontextdiagramm mit allen Nachbarsystemen vor?',
    source: 'arc42, Kapitel 3 (Kontextabgrenzung)',
  },
  // ── Cloud- und Infrastrukturarchitektur ───────────────────────────────────
  {
    id: 'cat-ci1', themeId: 'cloud-infrastructure', milestone: 'M20',
    text: 'Verkraftet die Lösung den Ausfall einer einzelnen Komponente ohne Serviceunterbruch?',
    source: 'AWS Well-Architected, Reliability',
  },
  {
    id: 'cat-ci2', themeId: 'cloud-infrastructure', milestone: 'M20',
    text: 'Sind Wiederherstellungsziele (RTO/RPO) definiert und vom Betreiber in einem DR-Konzept bestätigt?',
    source: 'AWS Well-Architected, Reliability',
  },
  {
    id: 'cat-ci3', themeId: 'cloud-infrastructure', milestone: 'M20',
    text: 'Werden Infrastruktur-Änderungen automatisiert und nachvollziehbar ausgerollt (Infrastructure as Code)?',
    source: 'AWS Well-Architected, Operational Excellence',
  },
  {
    id: 'cat-ci4', themeId: 'cloud-infrastructure', milestone: 'M40',
    text: 'Werden Kapazität und Kosten der Zielumgebung laufend überwacht?',
    source: 'AWS Well-Architected, Cost Optimization',
  },
  // ── Security & Compliance ─────────────────────────────────────────────────
  {
    id: 'cat-sc1', themeId: 'security-compliance', milestone: 'M20',
    text: 'Werden Daten bei der Übertragung und bei der Speicherung verschlüsselt?',
    source: 'AWS Well-Architected, Security',
  },
  {
    id: 'cat-sc2', themeId: 'security-compliance', milestone: 'M20',
    text: 'Ist ein Prozess für den Umgang mit Security-Incidents definiert?',
    source: 'AWS Well-Architected, Security / FINMA-RS 2023/1',
  },
  {
    id: 'cat-sc3', themeId: 'security-compliance', milestone: 'M20',
    text: 'Werden eingesetzte Komponenten und Abhängigkeiten auf bekannte Schwachstellen geprüft?',
    source: 'OWASP ASVS',
  },
  // ── IdM / IAM ─────────────────────────────────────────────────────────────
  {
    id: 'cat-am1', themeId: 'idm-iam', milestone: 'M20',
    text: 'Ist für administrative Zugriffe Multi-Faktor-Authentifizierung erzwungen?',
    source: 'OWASP ASVS / AWS Well-Architected, Security',
  },
  {
    id: 'cat-am2', themeId: 'idm-iam', milestone: 'M20',
    text: 'Folgen die Berechtigungen dem Least-Privilege-Prinzip?',
    source: 'AWS Well-Architected, Security',
  },
  {
    id: 'cat-am3', themeId: 'idm-iam', milestone: 'M40',
    text: 'Werden Berechtigungen regelmässig überprüft und rezertifiziert?',
    source: 'BSI IT-Grundschutz, ORP.4',
  },
  // ── Betriebsarchitektur ───────────────────────────────────────────────────
  {
    id: 'cat-op1', themeId: 'operations', milestone: 'M40',
    text: 'Gibt es Runbooks für Standard- und Notfall-Betriebsabläufe?',
    source: 'AWS Well-Architected, Operational Excellence',
  },
  {
    id: 'cat-op2', themeId: 'operations', milestone: 'M40',
    text: 'Ist die Alarmierung mit klaren Eskalationswegen geregelt?',
    source: 'AWS Well-Architected, Operational Excellence / SRE-Praxis',
  },
  // ── Dokumentation ─────────────────────────────────────────────────────────
  {
    id: 'cat-do1', themeId: 'documentation', milestone: 'M40',
    text: 'Folgt die Architekturdokumentation einer einheitlichen Struktur (z. B. arc42)?',
    source: 'arc42',
  },
  {
    id: 'cat-do2', themeId: 'documentation', milestone: 'M40',
    text: 'Sind wesentliche Architekturentscheide als ADRs festgehalten?',
    source: 'aim42 / ADR-Praxis',
  },
  // ── Technische Schulden ───────────────────────────────────────────────────
  {
    id: 'cat-td1', themeId: 'technical-debt', milestone: 'M40',
    text: 'Sind bekannte technische Schulden mit Aufwand und Risiko bewertet?',
    source: 'aim42 (Improve)',
  },
  // ── NIST RMF Prepare (SP 800-37 Rev. 2, Tasks P-1…P-18) ─────────────────
  {
    id: 'cat-nist-p1', themeId: 'security-compliance', milestone: 'M20',
    text: 'Sind die Rollen für das Sicherheits- und Datenschutz-Risikomanagement des Vorhabens benannt und besetzt (Risk Owner, Systemverantwortung, Security-Ansprechperson)?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Original: Identify and assign individuals to specific roles associated with security and privacy risk management.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-1 (Risk Management Roles)',
  },
  {
    id: 'cat-nist-p2', themeId: 'security-compliance', milestone: 'M20',
    text: 'Liegt eine Risikostrategie mit definierter Risikotoleranz vor, an der die Risikoentscheide des Vorhabens (Conditions, Risikoakzeptanz) gemessen werden?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Original: Establish a risk management strategy for the organization that includes a determination of risk tolerance.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-2 (Risk Management Strategy)',
  },
  {
    id: 'cat-nist-p3', themeId: 'security-compliance', milestone: 'M20',
    text: 'Ist eine organisationsweite Risikobeurteilung vorhanden und aktuell, auf die sich die systembezogene Risikobeurteilung des Vorhabens abstützt?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Original: Assess organization-wide security and privacy risk and update the risk assessment results on an ongoing basis.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-3 (Risk Assessment – Organization)',
  },
  {
    id: 'cat-nist-p4', themeId: 'security-compliance', milestone: 'M20',
    text: 'Gibt es organisationsweit angepasste Kontroll-Baselines oder Cybersecurity-Framework-Profile, gegen die das Vorhaben geprüft wird?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Bei NIST optional. Original: Establish, document, and publish organizationally-tailored control baselines and/or Cybersecurity Framework profiles.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-4 (Organizationally-Tailored Control Baselines and CSF Profiles)',
  },
  {
    id: 'cat-nist-p5', themeId: 'cloud-infrastructure', milestone: 'M20',
    text: 'Ist geklärt, welche Sicherheitsmassnahmen das Vorhaben von Plattform, Betreiber oder Organisation erbt (Common Controls) — und welche es selbst umsetzen muss?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Für die Architektur unmittelbar relevant: die Abgrenzung geerbt/selbst umgesetzt gehört zur Verantwortung je Komponente. Original: Identify, document, and publish organization-wide common controls that are available for inheritance by organizational systems.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-5 (Common Control Identification)',
  },
  {
    id: 'cat-nist-p6', themeId: 'data-classification', milestone: 'M20',
    text: 'Ist das System anhand seiner Auswirkungsstufe (Schutzklasse) im Portfolio priorisiert, sodass Ressourcen und Prüftiefe daran ausgerichtet werden?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Bei NIST optional. Original: Prioritize organizational systems and assets based on their impact level.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-6 (Impact-Level Prioritization)',
  },
  {
    id: 'cat-nist-p7', themeId: 'operations', milestone: 'M40',
    text: 'Ist das System in die organisationsweite Strategie zur laufenden Überwachung der Wirksamkeit der Sicherheitsmassnahmen (Continuous Monitoring) eingebunden?',
    hint: 'Organisationsebene (NIST P-1 bis P-7): Im Projekt-Review wird nur geprüft, ob die organisationsweite Vorgabe existiert und für das Vorhaben angewendet wird. Original: Develop and implement an organization-wide strategy for continuously monitoring control effectiveness.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-7 (Continuous Monitoring Strategy – Organization)',
  },
  {
    id: 'cat-nist-p8', themeId: 'integration-application', milestone: 'M20',
    text: 'Ist beschrieben, welche Geschäftsfunktionen und Geschäftsprozesse das System unterstützt?',
    hint: 'Systemebene. Original: Identify the missions, business functions, and mission/business processes that the system is intended to support.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-8 (Mission or Business Focus)',
  },
  {
    id: 'cat-nist-p9', themeId: 'operations', milestone: 'M20',
    text: 'Sind die Anspruchsgruppen des Systems benannt — Fachbereich, Architektur, Entwicklung, Betrieb, Security, Datenschutz, Lieferant — über Entwurf, Umsetzung, Betrieb und Ausserbetriebnahme?',
    hint: 'Systemebene. Original: Identify stakeholders who have an interest in the design, development, implementation, assessment, operation, maintenance, or disposal of the system.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-9 (System Stakeholders)',
  },
  {
    id: 'cat-nist-p10', themeId: 'integration-application', milestone: 'M20',
    text: 'Sind die schützenswerten Assets des Systems identifiziert — Hardware, Software, Daten, Schnittstellen, Personen und Rollen?',
    hint: 'Systemebene. Original: Identify assets that require protection.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-10 (Asset Identification)',
  },
  {
    id: 'cat-nist-p11', themeId: 'integration-application', milestone: 'M20',
    text: 'Ist die Systemgrenze festgelegt — welche Komponenten gehören zum System, welche liegen ausserhalb (Nachbarsysteme, Plattformdienste, Lieferanten)?',
    hint: 'Systemebene; entspricht der Kontextabgrenzung. Original: Determine the authorization boundary of the system.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-11 (Authorization Boundary)',
  },
  {
    id: 'cat-nist-p12', themeId: 'data-classification', milestone: 'M20',
    text: 'Sind alle Informationsarten identifiziert, die das System verarbeitet, speichert oder übermittelt — als Grundlage für die Schutzklasse?',
    hint: 'Systemebene. Original: Identify the types of information to be processed, stored, and transmitted by the system.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-12 (Information Types)',
  },
  {
    id: 'cat-nist-p13', themeId: 'data-storage', milestone: 'M20',
    text: 'Ist der Lebenszyklus jeder Informationsart beschrieben — Entstehung, Verarbeitung, Speicherung, Übermittlung, Archivierung, Löschung?',
    hint: 'Systemebene. Original: Identify and understand all stages of the information life cycle for each information type processed, stored, or transmitted by the system.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-13 (Information Life Cycle)',
  },
  {
    id: 'cat-nist-p14', themeId: 'technical-debt', milestone: 'M20',
    text: 'Liegt eine systembezogene Risikobeurteilung vor — identifizierte Risiken, Priorisierung, Massnahmen — und wird sie im Projektverlauf nachgeführt?',
    hint: 'Systemebene. Original: Conduct a system-level risk assessment and update the risk assessment results on an ongoing basis.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-14 (Risk Assessment – System)',
  },
  {
    id: 'cat-nist-p15', themeId: 'security-compliance', milestone: 'M20',
    text: 'Sind die Sicherheits- und Datenschutzanforderungen für das System und seine Betriebsumgebung definiert — abgeleitet aus Schutzklasse, Risiken und Vorgaben?',
    hint: 'Systemebene. Original: Define the security and privacy requirements for the system and the environment of operation.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-15 (Requirements Definition)',
  },
  {
    id: 'cat-nist-p16', themeId: 'integration-application', milestone: 'M20',
    text: 'Ist die Einordnung des Systems in die Unternehmensarchitektur geklärt — Zielbild, Applikationslandschaft, Abhängigkeiten?',
    hint: 'Systemebene. Original: Determine the placement of the system within the enterprise architecture.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-16 (Enterprise Architecture)',
  },
  {
    id: 'cat-nist-p17', themeId: 'cloud-infrastructure', milestone: 'M20',
    text: 'Sind die Sicherheits- und Datenschutzanforderungen den Systemkomponenten und der Betriebsumgebung zugeordnet — wer setzt welche Anforderung um (System, Plattform, Betreiber)?',
    hint: 'Systemebene. Original: Allocate security and privacy requirements to the system and to the environment of operation.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-17 (Requirements Allocation)',
  },
  {
    id: 'cat-nist-p18', themeId: 'integration-application', milestone: 'M20',
    text: 'Ist das System im Applikationsportfolio registriert (z. B. LeanIX: Applikations-Factsheet angelegt, Verantwortliche eingetragen)?',
    hint: 'Systemebene. Original: Register the system with organizational program or management offices.',
    source: 'NIST SP 800-37 Rev. 2, RMF Prepare, Task P-18 (System Registration)',
  },
];
