import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, FileSearch, NotebookPen } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AdminPageHeader } from "@/components/admin/AdminUi";
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
import { Textarea } from "@/components/ui/textarea";
import { adminApi } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/activity")({ component: ActivityAdmin });

function ActivityAdmin() {
  const { value: globalSearch } = useAdminSearch();
  const [kind, setKind] = useState("trackingId");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("moderation_review");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (globalSearch) setValue(globalSearch);
  }, [globalSearch]);
  const lookup = useMutation({
    mutationFn: () =>
      adminApi.activity(
        kind === "trackingId" ? { trackingId: value } : { anonymousId: value },
        reason,
      ),
  });
  const addNote = useMutation({
    mutationFn: () =>
      adminApi.addActorNote(
        lookup.data.actor.anonymousId,
        note,
        "Documenting an abuse investigation",
      ),
    onSuccess: () => setNote(""),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    lookup.mutate();
  }
  return (
    <>
      <AdminPageHeader
        eyebrow="Trust / 05"
        title="Anonymous activity"
        description="একটি browser-based pseudonymous ID-এর moderation timeline। এটি কোনো বাস্তব ব্যক্তির identity নয়।"
      />
      <form
        onSubmit={submit}
        className="grid gap-3 border border-border bg-card/45 p-4 md:grid-cols-[180px_1fr_220px_auto]"
      >
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trackingId">Tracking ID</SelectItem>
            <SelectItem value="anonymousId">Anonymous ID</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "trackingId" ? "MD-7K3Q9X" : "anon_..."}
          required
        />
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="moderation_review">Moderation review</SelectItem>
            <SelectItem value="abuse_investigation">Abuse investigation</SelectItem>
            <SelectItem value="support_request">Support request</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={lookup.isPending}>
          <FileSearch /> Lookup
        </Button>
      </form>
      {lookup.isError && (
        <p className="mt-4 border border-destructive/30 bg-destructive/5 p-4 text-sm text-red-200">
          {apiMessage(lookup.error)}
        </p>
      )}
      {lookup.data && (
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="border border-border bg-card/45">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-mono text-sm text-primary">{lookup.data.actor.anonymousId}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  First seen {new Date(lookup.data.actor.firstSeenAt).toLocaleString()}
                </p>
              </div>
              <Activity className="text-primary" />
            </div>
            <div className="divide-y divide-border">
              {lookup.data.timeline.length ? (
                lookup.data.timeline.map((item, index) => (
                  <div
                    key={`${item.type}-${item.id}-${index}`}
                    className="grid grid-cols-[100px_1fr_auto] gap-4 px-5 py-3 text-xs"
                  >
                    <span className="capitalize text-primary">{item.type}</span>
                    <span className="font-mono">{String(item.id)}</span>
                    <time className="text-muted-foreground">
                      {new Date(item.at).toLocaleString()}
                    </time>
                  </div>
                ))
              ) : (
                <p className="p-6 text-sm text-muted-foreground">No activity records.</p>
              )}
            </div>
          </section>
          <aside className="border border-border bg-card/45 p-5">
            <NotebookPen className="text-primary" />
            <h2 className="mt-4 text-lg font-bold">Append moderator note</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Raw IP, cookie, secret বা unsupported real-person claim লিখবেন না।
            </p>
            <div className="mt-5 grid gap-2">
              <Label htmlFor="actor-note">Note</Label>
              <Textarea
                id="actor-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
              />
            </div>
            <Button
              className="mt-4 w-full"
              variant="asphalt"
              disabled={note.trim().length < 1 || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              Save note
            </Button>
            {addNote.isError && (
              <p className="mt-3 text-xs text-red-300">{apiMessage(addNote.error)}</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
