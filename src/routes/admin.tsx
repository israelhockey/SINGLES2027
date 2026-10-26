import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/components/admin/shared";
import { AdminEmailCtx } from "@/components/admin/context";
import { HelpButton } from "@/components/admin/Help";
import adminCss from "../styles/admin.css?url";
import formsCss from "../styles/forms.css?url";
import { ALL_TEMPLATE_FONTS } from "@/forms/templates";

const FONTS = `https://fonts.googleapis.com/css2?${ALL_TEMPLATE_FONTS}&display=swap`;

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ניהול טפסים – אירוע ההכרויות 2027" },
      { name: "description", content: "אזור ניהול לצוות ההפקה: טפסים, תגובות וסטטיסטיקות." },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
      { rel: "stylesheet", href: adminCss },
      { rel: "stylesheet", href: formsCss },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell>
      {(email) => (
        <AdminEmailCtx.Provider value={email}>
          <Outlet />
          <HelpButton />
        </AdminEmailCtx.Provider>
      )}
    </AdminShell>
  );
}
