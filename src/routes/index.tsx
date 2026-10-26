import { createFileRoute } from "@tanstack/react-router";

import { getHomeForm } from "@/forms/api";
import { PublicFormPage, formHead, siteOrigin, type PublicLoad } from "@/forms/PublicFormPage";
import formsCss from "../styles/forms.css?url";

export const Route = createFileRoute("/")({
  loader: async (): Promise<PublicLoad> => {
    try {
      const form = await getHomeForm();
      return form
        ? { form, legacy: false, origin: siteOrigin() }
        : { form: null, legacy: true, origin: siteOrigin() };
    } catch (e) {
      // Forms system not switched on yet (or unreachable): keep the original form working.
      console.warn("home form unavailable, using built-in form", e);
      return { form: null, legacy: true, origin: siteOrigin() };
    }
  },
  head: ({ loaderData }) => {
    const h = formHead(loaderData);
    return { ...h, links: [...h.links, { rel: "stylesheet", href: formsCss }] };
  },
  component: Index,
});

function Index() {
  return <PublicFormPage data={Route.useLoaderData()} />;
}
