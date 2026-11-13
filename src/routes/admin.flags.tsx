import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Search } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { adminApi, type AdminFlag } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/flags")({ component: FlagsAdmin });

function FlagsAdmin() {
  const { value: search } = useAdminSearch();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [selected, setSelected] = useState<AdminFlag | null>(null);
  const [outcome, setOutcome] = useState("kept");
  const [note, setNote] = useState("");
  const flags = useQuery({
    queryKey: ["admin-flags", status],
    queryFn: () =>
      adminApi.flags({
        reviewStatus: status === "all" ? undefined : status,
        page: 1,
        pageSize: 50,
      }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.reviewFlag(id, outcome, note, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-flags"] }),
  });
  const items = (flags.data?.items ?? []).filter(
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
        eyebrow="Triage / 04"
        title="Community flag reports"
        description="Flag হলো policy concern, support/dispute-এর বিকল্প নয়। Human review ছাড়া target visibility বদলাবে না।"
      />
      <div className="mb-4 flex justify-end">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reports</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <AdminDataState
        loading={flags.isLoading}
        error={flags.isError ? apiMessage(flags.error) : undefined}
        empty={!items.length}
      >
        <AdminMobileList>
          {items.map((item) => (
            <AdminMobileCard
              key={item._id}
              eyebrow={item._id}
              title={`${item.targetType}: ${item.targetId}`}
              status={<StatusBadge value={item.outcome ?? item.reviewStatus} />}
              actions={
                item.reviewStatus === "pending" ? (
                  <Button
                    size="sm"
                    variant="asphalt"
                    onClick={() => {
                      setSelected(item);
                      setOutcome("kept");
                      setNote("");
                    }}
                  >
                    <CheckCircle2 /> Review
                  </Button>
                ) : undefined
              }
            >
              <AdminMobileField label="Reason" wide>
                {item.reason}
              </AdminMobileField>
              <AdminMobileField label="Reporter">{item.anonymousId ?? "unknown"}</AdminMobileField>
              <AdminMobileField label="Created">
                {new Date(item.createdAt).toLocaleString()}
              </AdminMobileField>
            </AdminMobileCard>
          ))}
        </AdminMobileList>
        <div className="hidden border border-border bg-card/45 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reporter</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="font-mono text-xs">{item._id}</TableCell>
                  <TableCell>
                    <span className="capitalize">{item.targetType}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {item.targetId}
                    </span>
                  </TableCell>
                  <TableCell className="capitalize">{item.reason}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.anonymousId ?? "unknown"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={item.outcome ?? item.reviewStatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    {item.reviewStatus === "pending" ? (
                      <Button
                        size="sm"
                        variant="asphalt"
                        onClick={() => {
                          setSelected(item);
                          setOutcome("kept");
                          setNote("");
                        }}
                      >
                        <CheckCircle2 /> Review
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Completed</span>
                    )}
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
        title="Review flag"
        description="Outcome hidden বা removed হলে target action একই transaction-এ সম্পন্ন হবে।"
        confirmLabel="Save review"
        destructive={outcome === "removed"}
        onConfirm={async (reason) => {
          if (selected) await mutation.mutateAsync({ id: selected._id, reason });
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kept">Keep target</SelectItem>
                <SelectItem value="hidden">Hide target</SelectItem>
                <SelectItem value="removed">Soft delete target</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Review note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Reviewer observation"
            />
          </div>
        </div>
      </AdminActionDialog>
    </>
  );
}
