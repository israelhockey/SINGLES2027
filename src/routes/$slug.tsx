import { createFileRoute } from "@tanstack/react-router";

import { getPublicForm } from "@/forms/api";
import {
  NotFoundForm,
  PublicFormPage,
  formHead,
  siteOrigin,
  type PublicLoad,
} from "@/forms/PublicFormPage";
import formsCss from "../styles/forms.css?url";

// Short form links: site.com/<name>. (site.com/f/<name> keeps working too.)
export const Route = createFileRoute("/$slug")({
  loader: async ({ params }): Promise<PublicLoad> => {
    try {
      return {
        form: await getPublicForm(params.slug.toLowerCase()),
        legacy: false,
        origin: siteOrigin(),
      };
    } catch (e) {
      console.warn("form unavailable", e);
      return { form: null, legacy: false };
    }
  },
  head: ({ loaderData }) => {
    const h = formHead(loaderData);
    return {
      ...h,
      meta: loaderData?.form ? h.meta : [{ title: "הטופס לא נמצא" }],
      links: [...h.links, { rel: "stylesheet", href: formsCss }],
    };
  },
  component: FormByShortLink,
});

function FormByShortLink() {
  const data = Route.useLoaderData();
  if (!data.form) return <NotFoundForm />;
  return <PublicFormPage data={data} />;
}
