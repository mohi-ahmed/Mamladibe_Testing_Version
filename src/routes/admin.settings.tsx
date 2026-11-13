import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole, ShieldAlert } from "lucide-react";
import { useState } from "react";

import {
  AdminActionDialog,
  AdminDataState,
  AdminPageHeader,
  StatusBadge,
} from "@/components/admin/AdminUi";
import { Switch } from "@/components/ui/switch";
import { adminApi, type AdminSettings } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettingsPage });

type SettingKey = "freezeIncidentPosting" | "freezeComments";

function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ key: SettingKey; next: boolean } | null>(null);
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: adminApi.settings });
  const update = useMutation({
    mutationFn: ({ key, next, reason }: { key: SettingKey; next: boolean; reason: string }) =>
      adminApi.updateSettings({ [key]: next, reason }),
    onSuccess: (data) => queryClient.setQueryData(["admin-settings"], data),
  });
  const item = settings.data;
  const rows: Array<{ key: SettingKey; label: string; description: string }> = [
    {
      key: "freezeIncidentPosting",
      label: "Freeze incident posting",
      description: "নতুন public incident submission সাময়িকভাবে বন্ধ করুন।",
    },
    {
      key: "freezeComments",
      label: "Freeze comments",
      description: "নতুন community comment submission সাময়িকভাবে বন্ধ করুন।",
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="System / 08"
        title="Platform controls"
        description="Emergency switches are Super Admin only. Every change requires a reason and creates an audit entry."
      />
      <AdminDataState
        loading={settings.isLoading}
        error={settings.isError ? apiMessage(settings.error) : undefined}
        empty={!item}
      >
        {item && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)]">
              <div className="flex items-center justify-between gap-3 border-b border-[#273134] px-[21px] py-[19px]">
                <div>
                  <h2 className="text-base font-bold">Safety switches</h2>
                  <p className="mt-1 text-[11px] text-[#82908b]">
                    High-impact actions require confirmation
                  </p>
                </div>
                <StatusBadge value="Super Admin only" />
              </div>
              <div className="px-[18px] py-2">
                {rows.map((row) => {
                  const enabled = item[row.key];
                  return (
                    <div
                      key={row.key}
                      className="flex items-center gap-4 border-t border-[#2e383a] px-2 py-[18px] first:border-t-0"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#263033] text-[#f3d54e]">
                        <ShieldAlert className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs">{row.label}</b>
                        <small className="mt-1 block text-[#82908b]">{row.description}</small>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-[#82908b]">
                          {enabled ? "ON" : "OFF"}
                        </span>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(next) => setPending({ key: row.key, next })}
                          aria-label={row.label}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)] p-[18px_22px]">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 text-[#f3d54e]" />
                <div>
                  <h3 className="font-bold">Production security</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#82908b]">
                    Secure HttpOnly session cookie, TOTP, RBAC, CSRF validation, lockout and
                    append-only audit logging are active.
                  </p>
                  {item.updatedAt && (
                    <p className="mt-2 font-mono text-[10px] text-[#61746f]">
                      Last changed {new Date(item.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </AdminDataState>
      <AdminActionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={`${pending?.next ? "Enable" : "Disable"} ${pending?.key === "freezeIncidentPosting" ? "posting freeze" : "comment freeze"}`}
        description="This changes public write availability immediately and will be recorded in the audit log."
        confirmLabel="Confirm setting"
        destructive={Boolean(pending?.next)}
        onConfirm={async (reason) => {
          if (pending) await update.mutateAsync({ ...pending, reason });
        }}
      />
    </>
  );
}
