import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EyeOff, RotateCcw, Trash2 } from "lucide-react";
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
import { adminApi, type AdminComment, type AdminSession } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/comments")({ component: CommentsAdmin });

function CommentsAdmin() {
  const queryClient = useQueryClient();
  const { value: q } = useAdminSearch();
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<{ item: AdminComment; action: string } | null>(null);
  const session = queryClient.getQueryData<AdminSession>(["admin-session"]);
  const comments = useQuery({
    queryKey: ["admin-comments", q, status],
    queryFn: () =>
      adminApi.comments({
        q: q || undefined,
        status: status === "all" ? undefined : status,
        page: 1,
        pageSize: 50,
      }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason: string }) =>
      action === "purge"
        ? adminApi.purgeComment(id, reason)
        : adminApi.moderateComment(id, action, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-comments"] }),
  });
  const items = comments.data?.items ?? [];
  return (
    <>
      <AdminPageHeader
        eyebrow="Community / 03"
        title="Comment moderation"
        description="Community corrections, extra information এবং opinions review করুন। Public commenters নিজের comment delete করতে পারে না।"
      />
      <div className="mb-4 flex justify-end">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
            <SelectItem value="deleted">Soft deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <AdminDataState
        loading={comments.isLoading}
        error={comments.isError ? apiMessage(comments.error) : undefined}
        empty={!items.length}
      >
        <AdminMobileList>
          {items.map((item) => (
            <AdminMobileCard
              key={item._id}
              eyebrow={item._id}
              title={item.text}
              status={<StatusBadge value={item.status} />}
              actions={
                <>
                  {item.status === "published" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected({ item, action: "hide" })}
                    >
                      <EyeOff /> Hide
                    </Button>
                  )}
                  {item.status === "hidden" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected({ item, action: "unhide" })}
                    >
                      <RotateCcw /> Unhide
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected({
                        item,
                        action: item.status === "deleted" ? "restore" : "soft_delete",
                      })
                    }
                  >
                    {item.status === "deleted" ? <RotateCcw /> : <Trash2 />}
                    {item.status === "deleted" ? "Restore" : "Delete"}
                  </Button>
                  {session?.admin.role === "super_admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-300"
                      onClick={() => setSelected({ item, action: "purge" })}
                    >
                      <Trash2 /> Purge
                    </Button>
                  )}
                </>
              }
            >
              <AdminMobileField label="Type">{item.type}</AdminMobileField>
              <AdminMobileField label="Anonymous actor">
                {item.anonymousId ?? "unknown"}
              </AdminMobileField>
              <AdminMobileField label="Created" wide>
                {new Date(item.createdAt).toLocaleString()}
              </AdminMobileField>
            </AdminMobileCard>
          ))}
        </AdminMobileList>
        <div className="hidden border border-border bg-card/45 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comment</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Anonymous actor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="max-w-xl">
                    <p className="line-clamp-2 text-sm leading-relaxed">{item.text}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">{item._id}</span>
                  </TableCell>
                  <TableCell className="capitalize">{item.type}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.anonymousId ?? "unknown"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={item.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {item.status === "published" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ item, action: "hide" })}
                        >
                          <EyeOff /> Hide
                        </Button>
                      )}
                      {item.status === "hidden" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ item, action: "unhide" })}
                        >
                          <RotateCcw /> Unhide
                        </Button>
                      )}
                      {item.status !== "deleted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ item, action: "soft_delete" })}
                        >
                          <Trash2 /> Delete
                        </Button>
                      )}
                      {item.status === "deleted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ item, action: "restore" })}
                        >
                          <RotateCcw /> Restore
                        </Button>
                      )}
                      {session?.admin.role === "super_admin" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-300"
                          onClick={() => setSelected({ item, action: "purge" })}
                        >
                          <Trash2 /> Purge
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
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={`${selected?.action.replaceAll("_", " ") ?? "Moderate"} comment`}
        description="Reason required. Comment text edit বা redaction SRS V1-এর অংশ নয়।"
        confirmLabel="Confirm action"
        destructive={selected?.action === "purge" || selected?.action === "soft_delete"}
        onConfirm={async (reason) => {
          if (selected)
            await mutation.mutateAsync({ id: selected.item._id, action: selected.action, reason });
        }}
      />
    </>
  );
}
