// Meilensteine sind fix (hard coded), Nummerierung M10 / M20 / M40
export const MILESTONES = ['M10', 'M20', 'M40'];

export const MILESTONE_TITLES: Record<string, string> = {
  M10: 'Foundation-Prüfung',
  M20: 'Prüfung der Architektur-Factsheets',
  M40: 'Betriebsnahe Prüfung',
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
  // Übergabe an eine Fachstelle (z. B. Security & Compliance): nur Themen mit
  // diesem Eintrag bieten im OnePager den Übergabetext (Mail-Icon) an.
  // E-Mail-Vorlage: to/subject/body mit Platzhaltern {{projekt}}, {{slug}},
  // {{thema}}, {{ms}}, {{meilenstein}}, {{klassifikation}}, {{termin}},
  // {{projektblock}}, {{ausloeser}}, {{ausgangslage}} (siehe OnePagerView).
  handover?: {
    to?: string;        // Empfänger (E-Mail-Adresse[n])
    subject?: string;   // Betreff-Vorlage
    body?: string;      // Text-Vorlage; fehlt sie, gilt der eingebaute Standardtext
    context?: string[]; // Frage-ids (auch anderer Themen), deren Antworten unter {{ausgangslage}} mitgegeben werden
  };
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

export interface Model {
  version: number;
  company?: string; // Firmenname — wird als Quelle bei eigenen Fragen angezeigt
  auth?: AuthSettings;
  classifications: Classification[];
  classificationInfoMd?: string; // Erklärung der Klassifikation (Markdown)
  themes: Theme[];
  questions: Question[];
  milestoneChecks?: MilestoneCheck[]; // Abnahme-Kontrollpunkte je Meilenstein
  [key: string]: unknown;
}

export type ReviewResult = 'ok' | 'okWithConditions' | 'notOk' | 'notAssessable';

// Antwort auf eine Prüffrage: true = Ja, false = Nein, null = offen;
// bei Auswahl-Fragen steht die gewählte Option in choice
export interface QuestionAnswer {
  value: boolean | null;
  remarks: string;
  choice?: string;
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
  [key: string]: unknown;
}
