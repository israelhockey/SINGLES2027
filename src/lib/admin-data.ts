import type { Tables } from "@/integrations/supabase/types";
import type { Application, Partner } from "./application";
import type { XlsxCell, XlsxColumn } from "./xlsx";

export type AppRow = Tables<"applications">;

export const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export const partnersOf = (r: AppRow): Partner[] =>
  Array.isArray(r.partners)
    ? (r.partners as Partial<Partner>[]).map((p) => ({
        name: String(p?.name ?? ""),
        phone: String(p?.phone ?? ""),
        email: String(p?.email ?? ""),
      }))
    : [];

/** The community's reach: their own total if given, otherwise the sum of platforms. */
export const reachOf = (r: AppRow) =>
  r.total_exposure ??
  [r.fb_group, r.fb_page, r.instagram, r.whatsapp, r.newsletter].reduce<number>(
    (t, x) => t + (Number(x) || 0),
    0,
  );

export const fullName = (r: AppRow) => `${r.first_name} ${r.last_name}`.trim();

/** Israeli mobile -> international digits for wa.me, e.g. 050-123-4567 -> 972501234567. */
export function waNumber(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return d.length >= 9 ? d : "";
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function rowToApplication(r: AppRow): Application {
  return {
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    email: r.email,
    city: r.city,
    communityName: r.community_name,
    businessName: r.business_name,
    companyId: r.company_id,
    founded: r.founded,
    ageRange: r.age_range,
    purpose: r.purpose,
    audience: strList(r.audience),
    eventTypes: strList(r.event_types),
    eventsCount: r.events_count,
    attendance: r.attendance,
    fbGroup: r.fb_group,
    fbPage: r.fb_page,
    instagram: r.instagram,
    whatsapp: r.whatsapp,
    newsletter: r.newsletter,
    openRate: r.open_rate,
    clickRate: r.click_rate,
    totalExposure: r.total_exposure,
    partners: partnersOf(r),
  };
}

const num = (x: number | null) => (x == null ? null : Number(x));

/** Column layout of the Excel export, in the same order as the sign-up form. */
export function exportTable(
  rows: AppRow[],
  logoLinks: Map<string, string>,
): { columns: XlsxColumn[]; data: XlsxCell[][] } {
  const maxPartners = Math.max(1, ...rows.map((r) => partnersOf(r).length));
  const columns: XlsxColumn[] = [
    { header: "תאריך שליחה", width: 17 },
    { header: "שם פרטי", width: 13 },
    { header: "שם משפחה", width: 13 },
    { header: "טלפון נייד", width: 14 },
    { header: "מייל", width: 26 },
    { header: "עיר מגורים", width: 13 },
    { header: "שם הקהילה", width: 22 },
    { header: "שם העסק", width: 20 },
    { header: "ח.פ.", width: 12 },
    { header: "שנת הקמה", width: 10 },
    { header: "טווח גילאים", width: 12 },
    { header: "מטרת הקהילה", width: 40, wrap: true },
    { header: "קהל", width: 30, wrap: true },
    { header: "סוגי אירועים", width: 30, wrap: true },
    { header: "אירועים ומפגשים שהופקו", width: 14 },
    { header: "סך משתתפים", width: 12 },
    { header: "פייסבוק – חברים בקבוצה", width: 14 },
    { header: "פייסבוק – עוקבים בדף", width: 14 },
    { header: "אינסטגרם", width: 12 },
    { header: "וואטסאפ", width: 12 },
    { header: "ניוזלטר", width: 12 },
    { header: "% פתיחה", width: 9 },
    { header: "% הקלקה", width: 9 },
    { header: "חשיפה כללית משוערת", width: 14 },
    { header: "סך קהלים", width: 12 },
  ];
  for (let i = 1; i <= maxPartners; i++) {
    columns.push(
      { header: `שותף/ה ${i} – שם`, width: 16 },
      { header: `שותף/ה ${i} – טלפון`, width: 14 },
      { header: `שותף/ה ${i} – מייל`, width: 24 },
    );
  }
  columns.push(
    { header: "לוגו הקהילה (קישור ל-7 ימים)", width: 30 },
    { header: "לוגו נוסף (קישור ל-7 ימים)", width: 30 },
  );

  const data = rows.map((r) => {
    const partners = partnersOf(r);
    const pCells: XlsxCell[] = [];
    for (let i = 0; i < maxPartners; i++) {
      const p = partners[i];
      pCells.push(p?.name || null, p?.phone || null, p?.email || null);
    }
    return [
      new Date(r.created_at),
      r.first_name,
      r.last_name,
      r.phone,
      r.email,
      r.city,
      r.community_name,
      r.business_name,
      r.company_id,
      num(r.founded),
      r.age_range,
      r.purpose,
      strList(r.audience).join(", "),
      strList(r.event_types).join(", "),
      num(r.events_count),
      num(r.attendance),
      num(r.fb_group),
      num(r.fb_page),
      num(r.instagram),
      num(r.whatsapp),
      num(r.newsletter),
      num(r.open_rate),
      num(r.click_rate),
      num(r.total_exposure),
      reachOf(r),
      ...pCells,
      r.logo1_path ? (logoLinks.get(r.logo1_path) ?? null) : null,
      r.logo2_path ? (logoLinks.get(r.logo2_path) ?? null) : null,
    ];
  });

  return { columns, data };
}
