// A form is saved as one JSON definition: its texts, sections and questions.
// The public page and the admin editor both draw forms from this shape.

export type FieldType =
  | "short"
  | "long"
  | "number"
  | "phone"
  | "email"
  | "date"
  | "yesno"
  | "single"
  | "multi"
  | "dropdown"
  | "file"
  | "people";

export type Field = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** single / multi / dropdown */
  options?: string[];
  /** long text: maximum number of words (0 or empty = no limit) */
  maxWords?: number;
  /** number: include in the "total audience" box of its section */
  sum?: boolean;
  /** number: show a % sign */
  percent?: boolean;
  /** half = two questions side by side on wide screens */
  width?: "half" | "full";
};

export type Section = {
  id: string;
  title: string;
  subtitle?: string;
  /** label of the total box, shown when the section has number questions marked "sum" */
  sumLabel?: string;
  fields: Field[];
};

export type FormTexts = {
  /** small line above the headline (letter greeting / chat reply / top line) */
  kicker: string;
  /** the big headline inside the hero */
  headline: string;
  /** year or tag shown under the headline */
  year: string;
  /** page title under the hero */
  title: string;
  /** intro paragraph; wrap words in **double stars** to highlight them */
  lead: string;
  /** cities or highlights, separated by commas */
  cities: string;
  citiesNote: string;
  introTitle: string;
  introText: string;
  consent: string;
  submit: string;
  doneTitle: string;
  doneText: string;
  closedTitle: string;
  closedText: string;
  footer: string;
};

export type FormDef = {
  version: 1;
  texts: FormTexts;
  sections: Section[];
  /** up to 4 question ids shown as columns in the responses list; the first is the title */
  listFields: string[];
  /** a tiny link made for this form (e.g. is.gd/singles2027); admin-only info */
  share?: ShareLink;
  /** extra behaviour: auto-close and the button on the thank-you screen */
  settings?: FormSettings;
};

export type FormSettings = {
  /** ISO date-time; after it the form stops taking answers by itself */
  closeAt?: string | undefined;
  /** after this many answers the form stops taking answers by itself */
  maxResponses?: number | undefined;
  /** a button on the thank-you screen (e.g. "join our WhatsApp group") */
  doneButton?: { label: string; url: string } | undefined;
};

/** One earlier published version, kept so it can be restored. */
export type FormVersion = { at: string; def: FormDef };

export type ShareLink = {
  shortUrl: string;
  alias: string;
  /** the address the tiny link opens; if the form's link changes later, this goes stale */
  target: string;
  createdAt: string;
};

export type TemplateId = "letter" | "match" | "blush";

/** One saved form row, as the admin area sees it. */
export type FormRow = {
  id: string;
  slug: string;
  title: string;
  template: TemplateId;
  accent: string | null;
  status: "open" | "closed";
  is_home: boolean;
  draft: FormDef;
  published: FormDef | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  /** earlier published versions, newest first (needs database update part 3) */
  history?: FormVersion[] | undefined;
  /** secret for the "preview the draft" link (needs database update part 3) */
  preview_token?: string | null | undefined;
};

/** What the public page needs. */
export type PublicForm = {
  id: string;
  slug: string;
  template: TemplateId;
  accent: string | null;
  status: "open" | "closed";
  def: FormDef;
  /** false when the form is closed, past its closing date or full (older database: missing) */
  accepting?: boolean | undefined;
};

export type PersonAnswer = { name: string; phone: string; email: string };
export type AnswerValue = string | number | string[] | PersonAnswer[] | null;
export type Answers = Record<string, AnswerValue>;
/** question id -> storage paths of the uploaded files */
export type FileAnswers = Record<string, string[]>;

export type ResponseRow = {
  id: string;
  form_id: string;
  answers: Answers;
  labels: Record<string, string>;
  files: FileAnswers;
  created_at: string;
  /** handling status set by the admin (needs database update part 3) */
  status?: ResponseStatus | undefined;
  /** private admin note (needs database update part 3) */
  notes?: string | undefined;
  updated_at?: string | null | undefined;
};

export type ResponseStatus = "new" | "in_progress" | "approved" | "not_relevant";

export const RESPONSE_STATUSES: { id: ResponseStatus; he: string; en: string }[] = [
  { id: "new", he: "חדש", en: "New" },
  { id: "in_progress", he: "בטיפול", en: "In progress" },
  { id: "approved", he: "אושר", en: "Approved" },
  { id: "not_relevant", he: "לא רלוונטי", en: "Not relevant" },
];

export const FIELD_TYPES: { type: FieldType; he: string; en: string }[] = [
  { type: "short", he: "תשובה קצרה", en: "Short answer" },
  { type: "long", he: "פסקה", en: "Paragraph" },
  { type: "single", he: "בחירה אחת", en: "Multiple choice (one)" },
  { type: "multi", he: "בחירה מרובה", en: "Checkboxes (many)" },
  { type: "dropdown", he: "רשימה נפתחת", en: "Dropdown" },
  { type: "yesno", he: "כן / לא", en: "Yes / No" },
  { type: "number", he: "מספר", en: "Number" },
  { type: "phone", he: "טלפון", en: "Phone" },
  { type: "email", he: "מייל", en: "Email" },
  { type: "date", he: "תאריך", en: "Date" },
  { type: "file", he: "העלאת קובץ / לוגו", en: "File / logo upload" },
  { type: "people", he: "רשימת אנשים (שם, טלפון, מייל)", en: "People list (name, phone, email)" },
];

export const hasOptions = (t: FieldType) => t === "single" || t === "multi" || t === "dropdown";

export function uid(prefix = "q") {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36).slice(-4)}${r}`;
}

export function newField(type: FieldType): Field {
  const f: Field = { id: uid(), type, label: "", required: false, width: "full" };
  if (hasOptions(type)) f.options = ["אפשרות 1", "אפשרות 2"];
  if (type === "long") f.maxWords = 0;
  if (type === "short" || type === "phone" || type === "email" || type === "number")
    f.width = "half";
  return f;
}

export const newSection = (): Section => ({
  id: uid("s"),
  title: "חלק חדש",
  subtitle: "",
  fields: [],
});

/** Deep copy with fresh ids, used by "duplicate question / section". */
export function cloneField(f: Field): Field {
  return { ...structuredClone(f), id: uid() };
}
export function cloneSection(s: Section): Section {
  return { ...structuredClone(s), id: uid("s"), fields: s.fields.map(cloneField) };
}

export const allFields = (def: FormDef) => def.sections.flatMap((s) => s.fields);
