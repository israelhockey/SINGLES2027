import { createFileRoute } from "@tanstack/react-router";

import { FormsHome } from "@/components/admin/FormsHome";

export const Route = createFileRoute("/admin/")({
  component: FormsHome,
});
