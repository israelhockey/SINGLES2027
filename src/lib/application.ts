// Shape of one community application, plus the WhatsApp/text summary.

export type Partner = { name: string; phone: string; email: string };

export type Application = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  communityName: string;
  businessName: string;
  companyId: string;
  founded: number | null;
  ageRange: string;
  purpose: string;
  audience: string[];
  eventTypes: string[];
  eventsCount: number | null;
  attendance: number | null;
  fbGroup: number | null;
  fbPage: number | null;
  instagram: number | null;
  whatsapp: number | null;
  newsletter: number | null;
  openRate: number | null;
  clickRate: number | null;
  totalExposure: number | null;
  partners: Partner[];
};

export type ApplicationFiles = { logo1: File | null; logo2: File | null };

export const toNum = (v: string): number | null => {
  const n = parseFloat(String(v || "").replace(/[^\d.]/g, ""));
  return Number.isNaN(n) ? null : n;
};

export const fmt = (n: number) => n.toLocaleString("he-IL");

export function buildSummary(d: Application): string {
  const n = (x: number | null) => (x == null ? "—" : fmt(x));
  const list = (a: string[]) => (a.length ? a.join(", ") : "—");
  return [
    "בקשת הצטרפות – אירוע ההכרויות הגדול של ישראל 2027",
    "",
    "▪ פרטים אישיים",
    `שם: ${d.firstName} ${d.lastName}`,
    `טלפון: ${d.phone}`,
    `מייל: ${d.email}`,
    `עיר מגורים: ${d.city}`,
    "",
    "▪ מאפייני הקהילה והעסק",
    `קהילה: ${d.communityName}`,
    `עסק: ${d.businessName}`,
    `ח.פ.: ${d.companyId || "—"}`,
    `שנת הקמה: ${d.founded ?? "—"}`,
    `טווח גילאים: ${d.ageRange || "—"}`,
    `מטרת הקהילה: ${d.purpose || "—"}`,
    `קהל: ${list(d.audience)}`,
    `סוגי אירועים: ${list(d.eventTypes)}`,
    `אירועים ומפגשים שהופקו: ${n(d.eventsCount)}`,
    `סך משתתפים: ${n(d.attendance)}`,
    "",
    "▪ פלטפורמות הקהילה",
    `פייסבוק – חברים בקבוצה: ${n(d.fbGroup)}`,
    `פייסבוק – עוקבים בדף: ${n(d.fbPage)}`,
    `וואטסאפ: ${n(d.whatsapp)}`,
    `אינסטגרם: ${n(d.instagram)}`,
    `ניוזלטר: ${n(d.newsletter)} (פתיחה ${d.openRate ?? "—"}%, הקלקה ${d.clickRate ?? "—"}%)`,
    `חשיפה משוערת בכל הערוצים: ${n(d.totalExposure)}`,
    "",
    "▪ מנהלים ושותפים",
    ...(d.partners.length
      ? d.partners.map((p) => [p.name, p.phone, p.email].filter(Boolean).join(" – "))
      : ["—"]),
    "",
    "(הלוגו מצורף בנפרד)",
  ].join("\n");
}
