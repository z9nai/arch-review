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
    text: 'Sind Wiederherstellungsziele (RTO/RPO) definiert und getestet?',
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
];
