import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, KeyRound, Plus, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AdminActionDialog,
  AdminDataState,
  AdminMobileCard,
  AdminMobileField,
  AdminMobileList,
  AdminPageHeader,
  StatusBadge,
} from "@/components/admin/AdminUi";
import { useAdminSearch } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi, type AdminRole, type AdminUser } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/users")({ component: UsersAdmin });

function UsersAdmin() {
  const { value: search } = useAdminSearch();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<{ email: string; role: AdminRole }>({
    email: "",
    role: "moderator",
  });
  const [action, setAction] = useState<{ item: AdminUser; type: "disable" | "reset" } | null>(null);
  const [token, setToken] = useState("");
  const users = useQuery({ queryKey: ["admin-users"], queryFn: adminApi.users });
  const create = useMutation({
    mutationFn: (reason: string) => adminApi.createUser({ ...draft, reason }),
    onSuccess: (result) => {
      setToken(result.enrollmentToken);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const update = useMutation({
    mutationFn: async ({
      item,
      type,
      reason,
    }: {
      item: AdminUser;
      type: string;
      reason: string;
    }) => {
      if (type === "reset") return adminApi.reset2fa(item.id, reason);
      await adminApi.updateUser(item.id, { active: false, reason });
      return { enrollmentToken: "" };
    },
    onSuccess: (result) => {
      if (result.enrollmentToken) setToken(result.enrollmentToken);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const items = (users.data?.items ?? []).filter(
    (item) =>
      !search ||
      Object.values(item).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
  );
  return (
    <>
      <AdminPageHeader
        eyebrow="Access / 07"
        title="Admin users"
        description="Pending enrolment, account access, role এবং 2FA lifecycle। এই screen শুধু Super Admin-এর জন্য।"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Add admin
          </Button>
        }
      />
      {token && (
        <div className="mb-5 border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-primary">One-time enrolment token</p>
          <p className="mt-1 text-xs text-muted-foreground">
            এটি এখনই নতুন Admin-কে secure channel-এ দিন। পরে আর দেখানো হবে না।
          </p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={token} className="font-mono text-xs" />
            <Button
              variant="asphalt"
              onClick={async () => {
                await navigator.clipboard.writeText(token);
                toast.success("Token copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
        </div>
      )}
      <AdminDataState
        loading={users.isLoading}
        error={users.isError ? apiMessage(users.error) : undefined}
        empty={!items.length}
      >
        <AdminMobileList>
          {items.map((item) => (
            <AdminMobileCard
              key={item.id}
              eyebrow={item.id}
              title={item.email}
              status={
                <StatusBadge
                  value={item.active ? "active" : item.enrollmentExpiresAt ? "pending" : "disabled"}
                />
              }
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAction({ item, type: "reset" })}
                  >
                    <KeyRound /> Reset 2FA
                  </Button>
                  {item.active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-300"
                      onClick={() => setAction({ item, type: "disable" })}
                    >
                      <UserX /> Disable
                    </Button>
                  )}
                </>
              }
            >
              <AdminMobileField label="Role">
                {item.role === "super_admin" ? "Super Admin" : "Moderator"}
              </AdminMobileField>
              <AdminMobileField label="Last login">
                {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : "Never"}
              </AdminMobileField>
            </AdminMobileCard>
          ))}
        </AdminMobileList>
        <div className="hidden border border-border bg-card/45 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <strong className="text-sm">{item.email}</strong>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {item.id}
                    </span>
                  </TableCell>
                  <TableCell>{item.role === "super_admin" ? "Super Admin" : "Moderator"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      value={
                        item.active ? "active" : item.enrollmentExpiresAt ? "pending" : "disabled"
                      }
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAction({ item, type: "reset" })}
                      >
                        <KeyRound /> Reset 2FA
                      </Button>
                      {item.active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-300"
                          onClick={() => setAction({ item, type: "disable" })}
                        >
                          <UserX /> Disable
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AdminDataState>
      <AdminActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create admin account"
        description="Account pending থাকবে। One-time token দিয়ে password ও TOTP enrolment সম্পন্ন করতে হবে।"
        confirmLabel="Create account"
        onConfirm={(reason) => create.mutateAsync(reason).then(() => undefined)}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select
              value={draft.role}
              onValueChange={(value: AdminRole) => setDraft({ ...draft, role: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </AdminActionDialog>
      <AdminActionDialog
        open={Boolean(action)}
        onOpenChange={(open) => !open && setAction(null)}
        title={action?.type === "reset" ? "Reset 2FA" : "Disable admin"}
        description={
          action?.type === "reset"
            ? "Current sessions revoke হবে এবং নতুন enrolment token তৈরি হবে।"
            : "Current sessions সঙ্গে সঙ্গে revoke হবে।"
        }
        confirmLabel={action?.type === "reset" ? "Reset 2FA" : "Disable account"}
        destructive
        onConfirm={async (reason) => {
          if (action) await update.mutateAsync({ ...action, reason });
        }}
      />
    </>
  );
}
