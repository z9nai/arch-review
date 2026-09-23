// Meilensteine sind fix (hard coded), Nummerierung M10 / M20 / M40
export const MILESTONES = ['M10', 'M20', 'M40'];

// Titel = die drei Phasen der Architekturprüfung. Die Nummern folgen dem
// HERMES-Meilensteinplan der Projekte: M40 ist die Abnahme (Realisierung
// abgeschlossen, technische und sicherheitsrelevante Freigabe vor Go-Live);
// MS60 (Projektabschluss) ist bewusst kein Prüfmeilenstein.
export const MILESTONE_TITLES: Record<string, string> = {
  M10: 'Architektur-Relevanz',
  M20: 'Architektur-Vorgaben',
  M40: 'Architektur-Abnahme',
};

// Kurzbeschrieb je Meilenstein — im OnePager unter dem Titel und im PDF
export const MILESTONE_INFO: Record<string, string> = {
  M10: 'Gate-Fragen je Thema entscheiden, ob und in welcher Klassifikation das Vorhaben architekturrelevant ist — und welche Themen in M20 geprüft werden.',
  M20: 'Prüfung der Spezifikation gegen die Architektur-Vorgaben je Thema. Die Freigabe schaltet die Abnahme (M40) frei.',
  M40: 'Nachweis, dass umgesetzt, getestet, betrieben und dokumentiert ist, was in M20 spezifiziert wurde. Die Architektur-Abnahme ist Teil der technischen Freigabe vor dem Go-Live (MS40/MS50) und Voraussetzung für die Projektabnahme bei MS60.',
};

// Stammdaten aus model.json.
// Klassifikationen: Reihenfolge = aufsteigend; die erste Stufe gilt als
// «nicht architekturrelevant» (wird bei «alle M10-Fragen Nein» automatisch
// gesetzt), die weiteren wählt der/die Architekt/in im M10.
export interface Classification {
  id: string;
  label: string;
}

// Abnahme-Kontrollpunkt eines Meilensteins (z. B. «FINMA-Prüfung» im M20):
// erscheint im Meilenstein-Kopf als «… erforderlich». Ist er erforderlich,
// braucht es Abnahme, Prüfer/in und Bemerkung — und der Meilenstein kann erst
// freigegeben werden, wenn alle erforderlichen Prüfungen abgenommen sind.
// Zustand im Projekt unter reviews.<ms>.checks[id] (MilestoneCheckState).
export interface MilestoneCheck {
  id: string;
  milestone: string;   // M10 / M20 / M40
  label: string;       // z. B. «FINMA-Prüfung» — angezeigt als «<label> erforderlich»
  hint?: string;       // Erläuterung (Tooltip)
  [key: string]: unknown;
}

export interface MilestoneCheckState {
  required: boolean;     // Prüfung ist für dieses Vorhaben nötig
  assessment?: string;   // Einschätzung Architektur (Pflicht, wenn erforderlich)
  // Resultat Abnahme:
  approved?: boolean;    // Prüfung abgenommen
  approvedBy?: string;   // durch wen
  remarks?: string;      // Bemerkungen (Pflicht, wenn erforderlich)
  [key: string]: unknown;
}

// Thema: Titel und Info (Markdown, hinter dem Info-Icon).
// Die Nummerierung A–Z ergibt sich automatisch aus der Reihenfolge.
export interface Theme {
  id: string;
  title: string;
  infoMd?: string;
  [key: string]: unknown;
}

// Frage: ein Text, einem Meilenstein und einem Thema zugeordnet.
// Die angezeigte Nummer (z. B. M10F1) wird automatisch vergeben;
// id ist ein stabiler interner Schlüssel, an dem die Antworten hängen.
export interface Question {
  id: string;
  text: string;
  milestone: string;
  themeId: string;
  kind?: 'yesNo' | 'text' | 'choice'; // Default yesNo; choice = Auswahl aus options
  options?: string[];      // Auswahlmöglichkeiten für kind 'choice'
  hint?: string;           // Erläuterung — wird hinter einem Info-Icon als
                           // Dialog angezeigt (Markdown, z. B. Stufenbeschreibung
                           // mit Beispielen bei choice-Fragen)
  remarksAlwaysOpen?: boolean; // Bemerkungen-Textarea immer sichtbar statt hinter
                           // «Bemerkungen …» versteckt (z. B. wenn eine Begründung
                           // praktisch immer erwartet wird)
  source?: string;         // Quelle, z. B. «Prüfformular Datenhaltung, Schritt 2»
  minClassification?: string; // Mindest-Klassifikation (id, kumulativ nach
                           // Reihenfolge, z. B. «ab wegweisend»); nicht
                           // gesetzt = gilt für alle Klassifikationen
  enabled?: boolean;       // false = deaktiviert (bleibt im Katalog, wird aber
                           // im OnePager nicht gestellt); Default aktiv
  archived?: boolean;      // true = archiviert: die id bleibt für immer reserviert,
                           // die Frage wird in neuen Reviews nicht mehr gestellt;
                           // wo bereits eine Antwort existiert, bleibt sie
                           // schreibgeschützt sichtbar (alte Reviews brechen nicht).
                           // Die automatische Nummer bleibt belegt (Lücke).
  [key: string]: unknown;
}

// Anmeldung über Microsoft Entra ID — im Admin gepflegt, gilt für alle
// Benutzer des geteilten Ordners (Client-/Tenant-ID sind keine Geheimnisse)
// Rollen = Werte der Entra-App-Rollen. Höchste passende Rolle gewinnt:
// Admin (alles) > Reviewer (arbeiten, kein Admin-Modus) > Viewer (nur lesen,
// PDFs exportieren). Ohne konfigurierte Rollen gilt jede angemeldete Person
// als Admin; ist eine Reviewer-Rolle konfiguriert, brauchen alle eine Rolle.
export interface AuthSettings {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  adminRole?: string;
  reviewerRole?: string;
  viewerRole?: string;
}

// Vorlage für den Reviewbericht (Admin): ein PDF als Briefpapier, Seite 1 =
// Deckblatt, Seite 2 = Folgeseiten (nur eine Seite → für alle). Das PDF
// enthält nur Grafik (Logo, Formen); Titel, Kopf- und Fusszeilentexte zeichnet
// der Export selbst. Als Base64 in model.json, damit lokaler Ordner und
// SharePoint gleich funktionieren.
export interface ReportTemplate {
  pdfBase64: string;
  fileName?: string;
  pageCount?: number;
  docType?: string;      // Kopfzeile rechts, z. B. «Architekturprüfung · Reviewbericht»
  footerLeft?: string;   // Fusszeile links; Platzhalter {{datum}}, {{projekt}}, {{nummer}}
  [key: string]: unknown;
}

export interface Model {
  version: number;
  company?: string; // Firmenname — wird als Quelle bei eigenen Fragen angezeigt
  auth?: AuthSettings;
  reportTemplate?: ReportTemplate; // Briefpapier für den Reviewbericht (PDF-Export)
  classifications: Classification[];
  classificationInfoMd?: string; // Erklärung der Klassifikation (Markdown)
  themes: Theme[];
  questions: Question[];
  milestoneChecks?: MilestoneCheck[]; // Abnahme-Kontrollpunkte je Meilenstein
  // Übergabe an die Fachstelle (Mail): ein Empfänger für den Sicherheits-Review,
  // ausgelöst von den erforderlichen Abnahme-Kontrollpunkten. Platzhalter:
  // {{anrede}} {{projekt}} {{slug}} {{pruefungen}} {{ms}} {{meilenstein}}
  // {{klassifikation}} {{termin}} {{projektblock}} {{einschaetzung}}
  // {{ausloeser}} {{ausgangslage}} — fehlt die Vorlage, gilt der eingebaute
  // Standardtext (siehe OnePagerView).
  handover?: {
    to?: string;        // Empfänger, z. B. security@firma.ch
    name?: string;      // Ansprechperson — der Vorname daraus bildet die Anrede
    subject?: string;
    body?: string;
    context?: string[]; // Frage-ids, deren Antworten unter {{ausgangslage}} mitgehen
  };
  [key: string]: unknown;
}

export type ReviewResult = 'ok' | 'okWithConditions' | 'notOk' | 'notAssessable';

// Antwort auf eine Prüffrage: true = Ja, false = Nein, null = offen;
// bei Auswahl-Fragen steht die gewählte Option in choice
export interface QuestionAnswer {
  value: boolean | null;
  remarks: string;
  choice?: string;
  sources?: string[]; // ids aus Project.sources — Quellen, die diese Antwort stützen
}

// Review-Eintrag: je Thema (Relevanz + Antworten) oder je Meilenstein
// (Kopf: geprüft/freigegeben, Prüfer, Bemerkungen) unter reviews.m10/m20/m40.
// Unbekannte Felder bleiben beim Lesen erhalten und werden beim Schreiben
// unverändert zurückgeschrieben (Forward-Kompatibilität).
export interface Review {
  relevant: boolean | null;
  reviewed: boolean;
  result: ReviewResult | null;
  milestone: string;
  notes: string;
  answers?: Record<string, QuestionAnswer>; // je Frage-id
  approved?: boolean;   // Freigabe (schaltet den nächsten Meilenstein frei)
  approvedBy?: string;  // Prüfer/in
  checks?: Record<string, MilestoneCheckState>; // Abnahme-Kontrollpunkte (model.milestoneChecks), je id
  [key: string]: unknown;
}

// Quelle (Beleg, Referenzdokument) am Projekt — Anhang mit Label und kurzem
// Beschrieb; jede Person mit Zugriff auf das Projekt kann sie öffnen. Zwei
// Arten: hochgeladene Datei (filename/size gesetzt, liegt unter
// projects/<slug>/sources/<id>-<dateiname>, referenziert per id) oder
// Web-Referenz (url gesetzt, kein Datei-Upload) — genau eines von beiden.
export interface SourceFile {
  id: string;
  label: string;
  description?: string;
  filename?: string;   // ursprünglicher Dateiname (für den Download) — Datei-Quelle
  size?: number;
  contentType?: string;
  url?: string;         // externer Link — Web-Referenz statt Datei-Upload
  uploadedAt: string;   // ISO
  uploadedBy?: string;
}

export interface Project {
  version: number;
  slug: string;
  name: string;
  description?: string; // Kurzbeschrieb (z. B. Ausgangslage/Motivation aus M10)
  responsibleProject: string;
  responsibleArchitecture: string;
  classification: string | null;
  architectureRelevant: boolean | null;
  createdAt: string;
  updatedAt: string;
  reviews: Record<string, Partial<Review>>;
  sources?: SourceFile[]; // hochgeladene Belege/Referenzdokumente
  [key: string]: unknown;
}
