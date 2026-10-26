import { Link, createFileRoute } from "@tanstack/react-router";

import { useAdminEmail } from "@/components/admin/context";
import { LegacyDashboard } from "@/components/admin/LegacyDashboard";
import { useT } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/legacy")({
  component: Legacy,
});

function Legacy() {
  const t = useT();
  return (
    <>
      <nav className="crumbs small legacy-crumbs">
        <Link to="/admin">{t("← חזרה לטפסים שלי", "← Back to my forms")}</Link>
      </nav>
      <LegacyDashboard email={useAdminEmail()} />
    </>
  );
}
