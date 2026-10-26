import { createFileRoute } from "@tanstack/react-router";

import { getPublicForm } from "@/forms/api";
import {
  NotFoundForm,
  PublicFormPage,
  formHead,
  siteOrigin,
  type PublicLoad,
} from "@/forms/PublicFormPage";
import formsCss from "../../styles/forms.css?url";

export const Route = createFileRoute("/f/$slug")({
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
  component: FormBySlug,
});

function FormBySlug() {
  const data = Route.useLoaderData();
  if (!data.form) return <NotFoundForm />;
  return <PublicFormPage data={data} />;
}
