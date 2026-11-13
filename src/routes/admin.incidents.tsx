import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Edit3, EyeOff, FilePlus2, RotateCcw, Trash2 } from "lucide-react";
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
import { adminApi, type AdminIncident, type AdminSession } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/incidents")({ component: IncidentsAdmin });

type SelectedAction = {
  incident: AdminIncident;
  action: "hide" | "unhide" | "soft_delete" | "restore" | "purge";
} | null;

function IncidentsAdmin() {
  const queryClient = useQueryClient();
  const { value: q } = useAdminSearch();
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<SelectedAction>(null);
  const [redacting, setRedacting] = useState<AdminIncident | null>(null);
  const [redaction, setRedaction] = useState({ title: "", description: "", safetyTip: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    category: "road",
    incidentAt: "",
    lat: "23.8103",
    lng: "90.4125",
    roadName: "",
    areaName: "",
    adminLabel: "official",
  });
  const session = queryClient.getQueryData<AdminSession>(["admin-session"]);
  const incidents = useQuery({
    queryKey: ["admin-incidents", q, status],
    queryFn: () =>
      adminApi.incidents({
        q: q || undefined,
        status: status === "all" ? undefined : status,
        page: 1,
        pageSize: 50,
      }),
  });
  const moderation = useMutation({
    mutationFn: ({
      item,
      action,
      reason,
    }: {
      item: AdminIncident;
      action: SelectedAction extends infer _ ? string : never;
      reason: string;
    }) =>
      action === "purge"
        ? adminApi.purgeIncident(item.trackingId, reason)
        : adminApi.moderateIncident(item.trackingId, action, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-incidents"] }),
  });
  const createIncident = useMutation({
    mutationFn: (reason: string) =>
      adminApi.createIncident({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        incidentAt: new Date(draft.incidentAt).toISOString(),
        lat: Number(draft.lat),
        lng: Number(draft.lng),
        roadName: draft.roadName,
        areaName: draft.areaName,
        adminLabel: draft.adminLabel,
        reason,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-incidents"] }),
  });
  const redactIncident = useMutation({
    mutationFn: (reason: string) => {
      if (!redacting) throw new Error("No incident selected.");
      return adminApi.redactIncident(redacting.trackingId, {
        title: redaction.title,
        description: redaction.description,
        safetyTip: redaction.safetyTip || null,
        reason,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-incidents"] }),
  });
  const items = incidents.data?.items ?? [];
  return (
    <>
      <AdminPageHeader
        eyebrow="Content / 02"
        title="Incident moderation"
        description="Published, hidden এবং soft-deleted reports review করুন। সত্য-মিথ্যার verdict নয়, policy ও visibility manage করুন।"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <FilePlus2 /> Team incident
          </Button>
        }
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
        loading={incidents.isLoading}
        error={incidents.isError ? apiMessage(incidents.error) : undefined}
        empty={!items.length}
      >
        <AdminMobileList>
          {items.map((item) => (
            <AdminMobileCard
              key={item.trackingId}
              eyebrow={item.trackingId}
              title={item.title}
              status={<StatusBadge value={item.status} />}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRedacting(item);
                      setRedaction({
                        title: item.title,
                        description: item.description,
                        safetyTip: item.safetyTip ?? "",
                      });
                    }}
                  >
                    <Edit3 /> Redact
                  </Button>
                  {item.status === "published" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected({ incident: item, action: "hide" })}
                    >
                      <EyeOff /> Hide
                    </Button>
                  )}
                  {item.status === "hidden" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected({ incident: item, action: "unhide" })}
                    >
                      <RotateCcw /> Unhide
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected({
                        incident: item,
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
                      onClick={() => setSelected({ incident: item, action: "purge" })}
                    >
                      <Trash2 /> Purge
                    </Button>
                  )}
                </>
              }
            >
              <AdminMobileField label="Location" wide>
                {item.areaName} · {item.roadName}
              </AdminMobileField>
              <AdminMobileField label="Category">
                {item.category}
                {item.adminLabel ? ` / ${item.adminLabel}` : ""}
              </AdminMobileField>
              <AdminMobileField label="Signals">
                +{item.support} / -{item.dispute} · {item.flags} flags
              </AdminMobileField>
            </AdminMobileCard>
          ))}
        </AdminMobileList>
        <div className="hidden border border-border bg-card/45 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incident</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.trackingId}>
                  <TableCell className="max-w-md">
                    <span className="font-mono text-[10px] text-primary">{item.trackingId}</span>
                    <strong className="mt-1 block line-clamp-1">{item.title}</strong>
                    <span className="text-xs text-muted-foreground">
                      {item.category}
                      {item.adminLabel ? ` / ${item.adminLabel}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{item.areaName}</span>
                    <span className="block text-xs text-muted-foreground">{item.roadName}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    +{item.support} / -{item.dispute}
                    <span className="block text-muted-foreground">{item.flags} flags</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={item.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRedacting(item);
                          setRedaction({
                            title: item.title,
                            description: item.description,
                            safetyTip: item.safetyTip ?? "",
                          });
                        }}
                      >
                        <Edit3 /> Redact
                      </Button>
                      {item.status === "published" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ incident: item, action: "hide" })}
                        >
                          <EyeOff /> Hide
                        </Button>
                      )}
                      {item.status === "hidden" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ incident: item, action: "unhide" })}
                        >
                          <RotateCcw /> Unhide
                        </Button>
                      )}
                      {item.status !== "deleted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ incident: item, action: "soft_delete" })}
                        >
                          <Trash2 /> Delete
                        </Button>
                      )}
                      {item.status === "deleted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected({ incident: item, action: "restore" })}
                        >
                          <RotateCcw /> Restore
                        </Button>
                      )}
                      {session?.admin.role === "super_admin" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-300"
                          onClick={() => setSelected({ incident: item, action: "purge" })}
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
        title={`${selected?.action.replaceAll("_", " ") ?? "Moderate"} incident`}
        description={`${selected?.incident.trackingId ?? ""} এর visibility পরিবর্তন হবে।`}
        confirmLabel="Confirm action"
        destructive={selected?.action === "purge" || selected?.action === "soft_delete"}
        onConfirm={async (reason) => {
          if (selected)
            await moderation.mutateAsync({
              item: selected.incident,
              action: selected.action,
              reason,
            });
        }}
      />
      <AdminActionDialog
        open={Boolean(redacting)}
        onOpenChange={(open) => !open && setRedacting(null)}
        title="Redact incident content"
        description={`${redacting?.trackingId ?? ""} content will be replaced and audited.`}
        confirmLabel="Save redaction"
        onConfirm={(reason) => redactIncident.mutateAsync(reason).then(() => undefined)}
      >
        <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              value={redaction.title}
              minLength={5}
              maxLength={100}
              onChange={(event) => setRedaction({ ...redaction, title: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={redaction.description}
              minLength={20}
              maxLength={2000}
              onChange={(event) => setRedaction({ ...redaction, description: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Safety tip (optional)</Label>
            <Textarea
              value={redaction.safetyTip}
              maxLength={500}
              onChange={(event) => setRedaction({ ...redaction, safetyTip: event.target.value })}
            />
          </div>
        </div>
      </AdminActionDialog>
      <AdminActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create team incident"
        description="এই report public feed-এ Mamladibe team content হিসেবে label হবে।"
        confirmLabel="Publish incident"
        onConfirm={(reason) => createIncident.mutateAsync(reason).then(() => undefined)}
      >
        <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={draft.category}
              onValueChange={(value) => setDraft({ ...draft, category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["accident", "violation", "police", "road", "safety", "other"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Label</Label>
            <Select
              value={draft.adminLabel}
              onValueChange={(value) => setDraft({ ...draft, adminLabel: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="official">Official</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Incident time</Label>
            <Input
              type="datetime-local"
              value={draft.incidentAt}
              onChange={(e) => setDraft({ ...draft, incidentAt: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Area</Label>
            <Input
              value={draft.areaName}
              onChange={(e) => setDraft({ ...draft, areaName: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Road</Label>
            <Input
              value={draft.roadName}
              onChange={(e) => setDraft({ ...draft, roadName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Latitude</Label>
              <Input
                value={draft.lat}
                onChange={(e) => setDraft({ ...draft, lat: e.target.value })}
              />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input
                value={draft.lng}
                onChange={(e) => setDraft({ ...draft, lng: e.target.value })}
              />
            </div>
          </div>
        </div>
      </AdminActionDialog>
    </>
  );
}
