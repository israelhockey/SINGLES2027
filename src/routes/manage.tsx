import { createFileRoute, redirect } from "@tanstack/react-router";

// The clean link to give the client: site.com/manage opens the admin (code entry).
export const Route = createFileRoute("/manage")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
