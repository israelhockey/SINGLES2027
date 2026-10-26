import type { AnswerValue, Answers, Field, FormDef, PersonAnswer, ResponseRow } from "./types";
import { allFields } from "./types";

export const isPeople = (v: AnswerValue): v is PersonAnswer[] =>
  Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null);

export const isStrList = (v: AnswerValue): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export const toNumber = (v: string): number | null => {
  const n = parseFloat(String(v || "").replace(/[^\d.-]/g, ""));
  return Number.isNaN(n) ? null : n;
};

/** One answer as plain text, for lists, summaries and Excel. */
export function answerText(f: Pick<Field, "type" | "percent">, v: AnswerValue | undefined): string {
  if (v == null || v === "") return "";
  if (isPeople(v)) {
    return v
      .map((p) => [p.name, p.phone, p.email].filter(Boolean).join(" – "))
      .filter(Boolean)
      .join(" | ");
  }
  if (isStrList(v)) return v.join(", ");
  if (typeof v === "number") {
    const s = Number.isInteger(v) && v >= 1900 && v <= 2100 ? String(v) : v.toLocaleString("he-IL");
    return f.percent ? `${s}%` : s;
  }
  return String(v);
}

/** Total of the number questions marked "sum" in the whole form. */
export function sumTotal(def: FormDef, answers: Answers) {
  return allFields(def)
    .filter((f) => f.type === "number" && f.sum)
    .reduce((t, f) => t + (typeof answers[f.id] === "number" ? (answers[f.id] as number) : 0), 0);
}

export const hasSum = (def: FormDef) => allFields(def).some((f) => f.type === "number" && f.sum);

/** Text version of a response (WhatsApp fallback and "copy all details"). */
export function answersSummary(
  def: FormDef,
  answers: Answers,
  fileNames: Record<string, string[]> = {},
) {
  const lines: string[] = [def.texts.title, ""];
  for (const s of def.sections) {
    lines.push(`▪ ${s.title}`);
    for (const f of s.fields) {
      const v =
        f.type === "file" ? (fileNames[f.id] ?? []).join(", ") || "" : answerText(f, answers[f.id]);
      lines.push(`${f.label || s.title}: ${v || "—"}`);
    }
    lines.push("");
  }
  if (Object.values(fileNames).some((x) => x.length)) lines.push("(הקבצים מצורפים בנפרד)");
  return lines.join("\n").trim();
}

/**
 * The questions to show for a response: today's questions first, then any answers
 * to questions that were deleted since (labelled from the snapshot saved with it).
 */
export function fieldsForResponse(
  def: FormDef,
  r: Pick<ResponseRow, "answers" | "labels" | "files">,
) {
  const current = allFields(def);
  const known = new Set(current.map((f) => f.id));
  const removed: Field[] = Object.keys({ ...r.answers, ...r.files })
    .filter((id) => !known.has(id))
    .map((id) => ({
      id,
      type: r.files[id] ? "file" : "short",
      label: r.labels?.[id] || id,
    }));
  return { current, removed };
}

export const phoneFields = (def: FormDef) => allFields(def).filter((f) => f.type === "phone");
export const emailFields = (def: FormDef) => allFields(def).filter((f) => f.type === "email");
