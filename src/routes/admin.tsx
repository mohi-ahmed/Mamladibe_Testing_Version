import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Mamladibe Admin Control Center" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: AdminShell,
});
