import type { TemplateId } from "./types";

export type Template = {
  id: TemplateId;
  he: string;
  en: string;
  descHe: string;
  descEn: string;
  accent: string;
  /** swatch colors for the template picker */
  swatch: [string, string, string];
  /** Google Fonts "family=" query for this design */
  fonts: string;
  /** what the "kicker" text is used for in this design */
  kickerHe: string;
  kickerEn: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "letter",
    he: "מכתב אהבה",
    en: "Love letter",
    descHe: "מעטפה לילך שנפתחת להזמנה בכתב יד, עם חותם לב",
    descEn: "A lilac envelope opening to a handwritten invitation",
    accent: "#b8304d",
    swatch: ["#eee7f6", "#cdbfe6", "#b8304d"],
    fonts: "family=Bellefair&family=Playpen+Sans+Hebrew:wght@400;500&family=Alef:wght@400;700",
    kickerHe: "פתיח המכתב (למשל ״ראשי הקהילות,״)",
    kickerEn: "Letter greeting",
  },
  {
    id: "match",
    he: "יש התאמה",
    en: "It's a match",
    descHe: "צעיר ושמח בסגנון אפליקציית היכרויות, עם שיחה קצרה",
    descEn: "Playful dating-app style with a short chat",
    accent: "#ff4f93",
    swatch: ["#fff3f8", "#46d9b4", "#ff4f93"],
    fonts: "family=Fredoka:wght@500;600;700&family=Varela+Round",
    kickerHe: "תשובה בבועת הצ׳אט (למשל ״אנחנו בפנים!״)",
    kickerEn: "Reply bubble in the chat",
  },
  {
    id: "blush",
    he: "ורוד פודרה",
    en: "Blush",
    descHe: "רך ואלגנטי, ורוד פודרה עם לבבות קטנים שעולים",
    descEn: "Soft and elegant with floating hearts",
    accent: "#c94f72",
    swatch: ["#fbecee", "#b48a54", "#c94f72"],
    fonts: "family=Frank+Ruhl+Libre:wght@300;400;500&family=Assistant:wght@400;600;700",
    kickerHe: "שורה קטנה מעל הכותרת",
    kickerEn: "Small line above the headline",
  },
];

export const templateOf = (id: string | null | undefined) =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;

export const ALL_TEMPLATE_FONTS = [...new Set(TEMPLATES.flatMap((t) => t.fonts.split("&")))].join(
  "&",
);

export const fontsUrl = (id: TemplateId) =>
  `https://fonts.googleapis.com/css2?${templateOf(id).fonts}&display=swap`;

/** Accent colors offered in the editor, besides a free color picker. */
export const ACCENTS = [
  "#b8304d",
  "#ff4f93",
  "#c94f72",
  "#7c3aed",
  "#2563eb",
  "#0f766e",
  "#ea580c",
  "#1f2937",
];
