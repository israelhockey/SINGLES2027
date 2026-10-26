import { createFileRoute } from "@tanstack/react-router";

import { FormEditor } from "@/components/admin/FormEditor";

export const Route = createFileRoute("/admin/forms/$formId/edit")({
  component: Page,
});

function Page() {
  const { formId } = Route.useParams();
  return <FormEditor key={formId} formId={formId} />;
}
