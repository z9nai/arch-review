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
  hint?: string;           // Erläuterung unterhalb der Frage
  source?: string;         // Quelle, z. B. «Prüfformular Datenhaltung, Schritt 2»
  minClassification?: string; // Mindest-Klassifikation (id, kumulativ nach
                           // Reihenfolge, z. B. «ab wegweisend»); nicht
                           // gesetzt = gilt für alle Klassifikationen
  enabled?: boolean;       // false = deaktiviert (bleibt im Katalog, wird aber
                           // im OnePager nicht gestellt); Default aktiv
  [key: string]: unknown;
}

export interface Model {
  version: number;
  company?: string; // Firmenname — wird als Quelle bei eigenen Fragen angezeigt
  classifications: Classification[];
  classificationInfoMd?: string; // Erklärung der Klassifikation (Markdown)
  themes: Theme[];
  questions: Question[];
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
