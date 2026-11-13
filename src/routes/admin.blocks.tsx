import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Plus, ShieldOff } from "lucide-react";
import { useState } from "react";

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
import { adminApi, type AdminBlock } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/blocks")({ component: BlocksAdmin });

function BlocksAdmin() {
  const { value: search } = useAdminSearch();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [remove, setRemove] = useState<AdminBlock | null>(null);
  const [draft, setDraft] = useState({
    targetType: "anonymous_id",
    targetRef: "",
    mode: "temporary",
    expiresAt: "",
  });
  const blocks = useQuery({ queryKey: ["admin-blocks"], queryFn: adminApi.blocks });
  const create = useMutation({
    mutationFn: (reason: string) =>
      adminApi.createBlock({
        ...draft,
        expiresAt: draft.mode === "temporary" ? new Date(draft.expiresAt).toISOString() : undefined,
        reason,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-blocks"] }),
  });
  const removeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.removeBlock(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-blocks"] }),
  });
  const items = (blocks.data?.items ?? []).filter(
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
        eyebrow="Trust / Blocks"
        title="Anonymous and network blocks"
        description="High-impact abuse controls। এই screen শুধু Super Admin-এর জন্য।"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Create block
          </Button>
        }
      />
      <AdminDataState
        loading={blocks.isLoading}
        error={blocks.isError ? apiMessage(blocks.error) : undefined}
        empty={!items.length}
      >
        <AdminMobileList>
          {items.map((item) => (
            <AdminMobileCard
              key={item.id}
              eyebrow={item.targetType}
              title={item.targetRef}
              status={<StatusBadge value={item.active ? "active" : "removed"} />}
              actions={
                item.active ? (
                  <Button size="sm" variant="ghost" onClick={() => setRemove(item)}>
                    <ShieldOff /> Remove
                  </Button>
                ) : undefined
              }
            >
              <AdminMobileField label="Mode">{item.mode}</AdminMobileField>
              <AdminMobileField label="Expiry">
                {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "Never"}
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
                <TableHead>Target</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{item.targetRef}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {item.targetType}
                    </span>
                  </TableCell>
                  <TableCell className="capitalize">{item.mode}</TableCell>
                  <TableCell className="max-w-sm text-xs">{item.reason}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={item.active ? "active" : "removed"} />
                  </TableCell>
                  <TableCell className="text-right">
                    {item.active && (
                      <Button size="sm" variant="ghost" onClick={() => setRemove(item)}>
                        <ShieldOff /> Remove
                      </Button>
                    )}
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
        title="Create block"
        description="Anonymous ID block browser identity-তে, network block HMAC network reference-এ প্রয়োগ হবে।"
        confirmLabel="Create block"
        destructive
        onConfirm={(reason) => create.mutateAsync(reason).then(() => undefined)}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Target type</Label>
            <Select
              value={draft.targetType}
              onValueChange={(value) => setDraft({ ...draft, targetType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anonymous_id">Anonymous ID</SelectItem>
                <SelectItem value="network_hash">Network hash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Target reference</Label>
            <Input
              value={draft.targetRef}
              onChange={(e) => setDraft({ ...draft, targetRef: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Mode</Label>
            <Select
              value={draft.mode}
              onValueChange={(value) => setDraft({ ...draft, mode: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="temporary">Temporary</SelectItem>
                <SelectItem value="permanent">Permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.mode === "temporary" && (
            <div className="grid gap-2">
              <Label>Expires at</Label>
              <Input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
              />
            </div>
          )}
        </div>
      </AdminActionDialog>
      <AdminActionDialog
        open={Boolean(remove)}
        onOpenChange={(open) => !open && setRemove(null)}
        title="Remove block"
        description="Block record retained থাকবে, শুধু active state বন্ধ হবে।"
        confirmLabel="Remove block"
        onConfirm={async (reason) => {
          if (remove) await removeMutation.mutateAsync({ id: remove.id, reason });
        }}
      />
    </>
  );
}
