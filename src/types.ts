// Stammdaten aus model.json — werden von der App nur GELESEN.
export interface Classification { id: string; label: string }
export interface ReviewDepth { id: string; label: string; personDays: number }

export interface FactsheetQuestion {
  id: string;            // z. B. "S1"
  text: string;          // die Frage
  hint?: string;         // Erläuterung unterhalb der Frage
  kind?: 'yesNo' | 'text'; // Default yesNo: «☐ Ja ☐ Nein Bemerkungen:»
  milestone?: string;    // wann die Frage gestellt wird; MS10 = Foundation-Prüfung
                         // (Default: Meilenstein des Factsheets)
}

export interface FactsheetDef {
  id: string;
  name: string;
  milestone: string;
  external: boolean;
  hint: string;
  description?: string; // Kurztext (Fallback für den Info-Dialog)
  infoMd?: string;      // statische Information als Markdown für den Info-Dialog
  questionsTitle?: string;        // Überschrift des Fragenblocks
  questions?: FactsheetQuestion[]; // Prüffragen fürs Ausklapp-Panel
  factsheetDoc: string;
  evidenceDoc: string; // enthält den Platzhalter {slug}
}

export interface Model {
  version: number;
  classifications: Classification[];
  reviewDepths: ReviewDepth[];
  milestones: string[];
  factsheets: FactsheetDef[];
}

export type ReviewResult = 'ok' | 'okWithConditions' | 'notOk' | 'notAssessable';

// Antwort auf eine Prüffrage: true = Ja, false = Nein, null = offen
export interface QuestionAnswer {
  value: boolean | null;
  remarks: string;
}

// Unbekannte Felder bleiben beim Lesen erhalten und werden beim Schreiben
// unverändert zurückgeschrieben (Forward-Kompatibilität).
export interface Review {
  relevant: boolean | null;
  reviewed: boolean;
  result: ReviewResult | null;
  milestone: string;
  notes: string;
  answers?: Record<string, QuestionAnswer>; // je Frage-id
  [key: string]: unknown;
}

export interface Project {
  version: number;
  slug: string;
  name: string;
  description?: string; // Kurzbeschrieb (z. B. Ausgangslage/Motivation aus MS10)
  responsibleProject: string;
  responsibleArchitecture: string;
  classification: string | null;
  reviewDepth: string | null;
  architectureRelevant: boolean | null;
  createdAt: string;
  updatedAt: string;
  reviews: Record<string, Partial<Review>>;
  [key: string]: unknown;
}
