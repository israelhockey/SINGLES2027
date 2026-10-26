import { createFileRoute } from "@tanstack/react-router";

import { FormResponses } from "@/components/admin/FormResponses";

export const Route = createFileRoute("/admin/forms/$formId/")({
  component: Page,
});

function Page() {
  const { formId } = Route.useParams();
  return <FormResponses key={formId} formId={formId} />;
}
