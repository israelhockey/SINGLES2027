import { createFileRoute } from "@tanstack/react-router";

import { getPreviewForm } from "@/forms/api";
import { FormRenderer } from "@/forms/FormRenderer";
import { NotFoundForm, formHead, type PublicLoad } from "@/forms/PublicFormPage";
import formsCss from "../../styles/forms.css?url";

/*
 * Secret preview link: site.com/preview/<name>?t=<secret>
 * Shows the DRAFT (unpublished changes) of a form to whoever has the link, so it can be
 * checked by someone else before publishing. Nothing filled in here is saved.
 * The admin turns the link on/off in the form editor → "Design & settings".
 */
export const Route = createFileRoute("/preview/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s["t"] === "string" ? (s["t"] as string).slice(0, 80) : "",
  }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ params, deps }): Promise<PublicLoad> => {
    if (!deps.t) return { form: null, legacy: false };
    try {
      return { form: await getPreviewForm(params.slug.toLowerCase(), deps.t), legacy: false };
    } catch (e) {
      console.warn("preview unavailable", e);
      return { form: null, legacy: false };
    }
  },
  head: ({ loaderData }) => {
    const h = formHead(loaderData);
    return {
      meta: [
        { title: `תצוגה מקדימה · ${h.meta[0]?.title ?? ""}` },
        { name: "robots", content: "noindex, nofollow" },
      ],
      links: [...h.links, { rel: "stylesheet", href: formsCss }],
    };
  },
  component: PreviewPage,
});

function PreviewPage() {
  const data = Route.useLoaderData();
  if (!data.form) return <NotFoundForm />;
  return (
    <>
      <div className="preview-banner" dir="rtl" lang="he">
        תצוגה מקדימה של טיוטה · עוד לא פורסם · שום דבר שממלאים כאן לא נשמר
      </div>
      <FormRenderer
        def={data.form.def}
        template={data.form.template}
        accent={data.form.accent}
        mode="preview"
      />
    </>
  );
}
