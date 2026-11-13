import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useAdminSearch } from "@/components/admin/AdminShell";
import {
  AdminDataState,
  AdminMobileCard,
  AdminMobileField,
  AdminMobileList,
  AdminPageHeader,
} from "@/components/admin/AdminUi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/audit")({ component: AuditAdmin });

function AuditAdmin() {
  const { value: search } = useAdminSearch();
  const audit = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => adminApi.audit({ page: 1, pageSize: 100, sort: "newest" }),
  });
  const items = (audit.data?.items ?? []).filter(
    (item) =>
      !search ||
      Object.values(item).some((value) =>
        JSON.stringify(value ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
  );
  return (
    <>
      <AdminPageHeader
        eyebrow="Accountability / 06"
        title="Immutable audit log"
        description="Admin action, target, reason এবং timestamp। এই records edit বা delete করা যায় না।"
      />
      <AdminDataState
        loading={audit.isLoading}
        error={audit.isError ? apiMessage(audit.error) : undefined}
        empty={!items.length}
      >
        <AdminMobileList>
          {items.map((item) => (
            <AdminMobileCard
              key={item._id}
              eyebrow={new Date(item.createdAt).toLocaleString()}
              title={item.action}
            >
              <AdminMobileField label="Admin" wide>
                {item.adminId?.email ?? "Admin"} · {item.adminId?.role}
              </AdminMobileField>
              <AdminMobileField label="Target" wide>
                {item.targetType} · <span className="font-mono">{item.targetId}</span>
              </AdminMobileField>
              <AdminMobileField label="Reason" wide>
                {item.reason}
              </AdminMobileField>
            </AdminMobileCard>
          ))}
        </AdminMobileList>
        <div className="hidden border border-border bg-card/45 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="font-mono text-xs text-primary">{item.action}</TableCell>
                  <TableCell>
                    <span className="text-xs">{item.adminId?.email ?? "Admin"}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {item.adminId?.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">{item.targetType}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {item.targetId}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md text-xs">{item.reason}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AdminDataState>
    </>
  );
}
