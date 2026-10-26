import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { answersSummary } from "./answers";
import { isAccepting, submitResponse } from "./api";
import { JOIN_2027 } from "./defaults";
import { FormRenderer, type SubmitResult } from "./FormRenderer";
import { fontsUrl, templateOf } from "./templates";
import type { Answers, PublicForm } from "./types";
import { toNum, type Application } from "@/lib/application";
import { submitApplication } from "@/lib/submit-application";

export type PublicLoad = { form: PublicForm | null; legacy: boolean; origin?: string };

/** The site's own address, on the server and in the browser (link previews need full URLs). */
export const siteOrigin = createIsomorphicFn()
  .server(() => {
    try {
      const req = getRequest();
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      const proto =
        req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "");
      return host ? `${proto}://${host}` : new URL(req.url).origin;
    } catch {
      return "";
    }
  })
  .client(() => window.location.origin);

/** Page <head> for a form: its title, description and the fonts of its design. */
export function formHead(data: PublicLoad | undefined) {
  const def = data?.form?.def ?? JOIN_2027;
  const template = data?.form?.template ?? "letter";
  const title = [def.texts.title, def.texts.year].filter(Boolean).join(" ");
  const description = (def.texts.introText || def.texts.lead || "")
    .replace(/\*\*/g, "")
    .slice(0, 200);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "he_IL" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(data?.origin
        ? [
            { property: "og:image", content: `${data.origin}/og-image.jpg` },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { property: "og:image:alt", content: title },
            { name: "twitter:image", content: `${data.origin}/og-image.jpg` },
          ]
        : []),
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      { rel: "stylesheet", href: fontsUrl(templateOf(template).id) },
    ],
  };
}

/* The original sign-up form keeps working until the forms system is switched on. */
async function legacySubmit(a: Answers, files: Record<string, File[]>): Promise<SubmitResult> {
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  const n = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : toNum(s(k)));
  const list = (k: string) => (Array.isArray(a[k]) ? (a[k] as string[]) : []);
  const app: Application = {
    firstName: s("firstName"),
    lastName: s("lastName"),
    phone: s("phone"),
    email: s("email"),
    city: s("city"),
    communityName: s("communityName"),
    businessName: s("businessName"),
    companyId: s("companyId"),
    founded: n("founded"),
    ageRange: s("ageRange"),
    purpose: s("purpose"),
    audience: list("audience"),
    eventTypes: list("eventTypes"),
    eventsCount: n("eventsCount"),
    attendance: n("attendance"),
    fbGroup: n("fbGroup"),
    fbPage: n("fbPage"),
    instagram: n("instagram"),
    whatsapp: n("whatsapp"),
    newsletter: n("newsletter"),
    openRate: n("openRate"),
    clickRate: n("clickRate"),
    totalExposure: n("totalExposure"),
    partners: Array.isArray(a["partners"]) ? (a["partners"] as Application["partners"]) : [],
  };
  const { saved } = await submitApplication(app, {
    logo1: files["logo1"]?.[0] ?? null,
    logo2: files["logo2"]?.[0] ?? null,
  });
  if (saved) return { ok: true };
  const names = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, v.map((f) => f.name)]),
  );
  return { ok: false, fallbackText: answersSummary(JOIN_2027, a, names) };
}

export function PublicFormPage({ data }: { data: PublicLoad }) {
  if (data.legacy || !data.form) {
    return <FormRenderer def={JOIN_2027} template="letter" mode="live" onSubmit={legacySubmit} />;
  }
  const form = data.form;
  const onSubmit = async (a: Answers, files: Record<string, File[]>): Promise<SubmitResult> => {
    try {
      await submitResponse(form, a, files);
      return { ok: true };
    } catch (e) {
      console.error("submitResponse failed", e);
      const names = Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, v.map((f) => f.name)]),
      );
      return { ok: false, fallbackText: answersSummary(form.def, a, names) };
    }
  };
  return (
    <FormRenderer
      def={form.def}
      template={form.template}
      accent={form.accent}
      mode={isAccepting(form) ? "live" : "closed"}
      onSubmit={onSubmit}
    />
  );
}

export function NotFoundForm() {
  return (
    <div className="s27f tpl-letter" dir="rtl" lang="he">
      <div className="wrap">
        <div className="done" style={{ marginTop: 80 }}>
          <div className="big">הטופס לא נמצא</div>
          <p>ייתכן שהקישור שגוי או שהטופס עוד לא פורסם.</p>
          <a className="btn" href="/">
            לעמוד הראשי
          </a>
        </div>
      </div>
    </div>
  );
}
