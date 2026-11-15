import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Network, RefreshCw, ShieldAlert, UserRoundSearch } from "lucide-react";
import { useState } from "react";

import { useAdminSearch } from "@/components/admin/AdminShell";
import {
  AdminDataState,
  AdminMetric,
  AdminMobileCard,
  AdminMobileField,
  AdminMobileList,
  AdminPageHeader,
} from "@/components/admin/AdminUi";
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
import { adminApi, type MonitoringEvent } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/monitoring")({ component: MonitoringAdmin });

type Subject = { kind: "actor" | "network"; ref: string };

const ranges: Record<string, number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
};

function reasonLabel(value: string) {
  const labels: Record<string, string> = {
    accepted: "Accepted",
    cooldown_90s: "90-second cooldown",
    user_hourly_5: "5 reports per user/hour",
    network_hourly_30: "30 reports per network/hour",
    captcha_failed: "CAPTCHA failed",
    invalid_submission: "Invalid submission",
    duplicate_content_location: "Duplicate content or location",
    comment_quota: "Comment quota",
    subject_blocked: "Blocked subject",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function ResultBadge({ result }: { result: MonitoringEvent["result"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[7px] border px-2 py-1 font-mono text-[10px] font-bold uppercase",
        result === "accepted" && "border-support/35 bg-support/10 text-support",
        result === "blocked" && "border-primary/35 bg-primary/10 text-primary",
        result === "failed" && "border-destructive/35 bg-destructive/10 text-red-300",
      )}
    >
      {result}
    </span>
  );
}

function MonitoringAdmin() {
  const { value: search } = useAdminSearch();
  const [range, setRange] = useState("24h");
  const [action, setAction] = useState("all");
  const [result, setResult] = useState("all");
  const [reason, setReason] = useState("all");
  const [subject, setSubject] = useState<Subject | null>(null);
  const from = new Date(Date.now() - ranges[range]!).toISOString();

  const summary = useQuery({
    queryKey: ["admin-monitoring-summary"],
    queryFn: adminApi.monitoringSummary,
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ["admin-monitoring-events", search, range, action, result, reason],
    queryFn: () =>
      adminApi.monitoringEvents({
        q: search || undefined,
        from,
        action: action === "all" ? undefined : action,
        result: result === "all" ? undefined : result,
        reason: reason === "all" ? undefined : reason,
        page: 1,
        pageSize: 100,
        sort: "newest",
      }),
    refetchInterval: 30_000,
  });
  const subjectDetails = useQuery({
    queryKey: ["admin-monitoring-subject", subject],
    queryFn: () =>
      adminApi.monitoringSubject(
        subject?.kind === "actor"
          ? { actorRef: subject.ref }
          : { networkRef: subject?.ref },
      ),
    enabled: Boolean(subject),
  });
  const items = events.data?.items ?? [];
  const data = summary.data;

  return (
    <>
      <AdminPageHeader
        eyebrow="Trust monitoring"
        title="Rate limit and spam activity"
        description="Privacy-safe operational signals only. Raw IP, cookie, CAPTCHA token এবং personal information সংরক্ষণ বা দেখানো হয় না।"
        action={
          <Button
            variant="asphalt"
            onClick={() => {
              void summary.refetch();
              void events.refetch();
            }}
          >
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          label="Report attempts, last hour"
          value={data?.reportAttempts1h ?? 0}
          detail={`${data?.reportAttempts24h ?? 0} in the last 24 hours`}
        />
        <AdminMetric
          label="Accepted reports, 24 hours"
          value={data?.acceptedReports24h ?? 0}
          detail={`${data?.blocked24h ?? 0} blocked activity attempts`}
        />
        <AdminMetric
          label="Cooldown blocks"
          value={data?.cooldownBlocks24h ?? 0}
          detail={`${data?.userLimitBlocks24h ?? 0} user-limit blocks`}
        />
        <AdminMetric
          label="Network-limit blocks"
          value={data?.networkLimitBlocks24h ?? 0}
          detail="30 reports per hashed network/hour"
        />
        <AdminMetric
          label="CAPTCHA failures"
          value={data?.captchaFailures24h ?? 0}
          detail={`${data?.invalidSubmissions24h ?? 0} invalid submissions`}
        />
        <AdminMetric
          label="Duplicate signals"
          value={data?.duplicateSignals24h ?? 0}
          detail="Matching content, time and location"
        />
        <AdminMetric
          label="Anonymous identities"
          value={data?.activeActors24h ?? 0}
          detail="Active in the last 24 hours"
        />
        <AdminMetric
          label="Hashed networks"
          value={data?.activeNetworks24h ?? 0}
          detail="Raw IP is never exposed"
        />
      </section>

      <section className="mt-6 rounded-[14px] border border-[#2e383a] bg-[#141b1d] p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger aria-label="Time range"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger aria-label="Activity action"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="incident">Report</SelectItem>
              <SelectItem value="comment">Comment</SelectItem>
              <SelectItem value="vote">Vote</SelectItem>
              <SelectItem value="flag">Flag</SelectItem>
              <SelectItem value="track">Track or edit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger aria-label="Activity result"><SelectValue placeholder="All results" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label="Activity reason"><SelectValue placeholder="All reasons" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              <SelectItem value="cooldown_90s">90-second cooldown</SelectItem>
              <SelectItem value="user_hourly_5">User hourly limit</SelectItem>
              <SelectItem value="network_hourly_30">Network hourly limit</SelectItem>
              <SelectItem value="captcha_failed">CAPTCHA failed</SelectItem>
              <SelectItem value="invalid_submission">Invalid submission</SelectItem>
              <SelectItem value="duplicate_content_location">Duplicate signal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="mt-3 text-[11px] text-[#82908b]">
          Top search accepts Tracking ID, reason, <span className="font-mono">anon_...</span> or <span className="font-mono">net_...</span> references.
        </p>
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminDataState
          loading={events.isLoading}
          error={events.isError ? apiMessage(events.error) : undefined}
          empty={!items.length}
        >
          <div>
            <AdminMobileList>
              {items.map((item) => (
                <AdminMobileCard
                  key={item.id}
                  eyebrow={new Date(item.createdAt).toLocaleString()}
                  title={reasonLabel(item.reason)}
                  status={<ResultBadge result={item.result} />}
                  actions={
                    <SubjectButtons item={item} onSelect={setSubject} />
                  }
                >
                  <AdminMobileField label="Action">{item.action}</AdminMobileField>
                  <AdminMobileField label="HTTP">{item.statusCode}</AdminMobileField>
                  <AdminMobileField label="Anonymous ID" wide>{item.actorRef ?? "Not available"}</AdminMobileField>
                  <AdminMobileField label="Network" wide>{item.networkRef ?? "Not available"}</AdminMobileField>
                  <AdminMobileField label="Target" wide>{item.targetId ?? "Not assigned"}</AdminMobileField>
                </AdminMobileCard>
              ))}
            </AdminMobileList>
            <div className="hidden overflow-hidden rounded-[14px] border border-[#2e383a] bg-[#141b1d] md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Result and reason</TableHead>
                    <TableHead>Anonymous identity</TableHead>
                    <TableHead>Hashed network</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap font-mono text-[10px] text-[#82908b]">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{item.action}</TableCell>
                      <TableCell>
                        <ResultBadge result={item.result} />
                        <span className="mt-1.5 block text-xs text-[#b9c4bf]">{reasonLabel(item.reason)}</span>
                      </TableCell>
                      <TableCell><SubjectRef kind="actor" value={item.actorRef} onSelect={setSubject} /></TableCell>
                      <TableCell><SubjectRef kind="network" value={item.networkRef} onSelect={setSubject} /></TableCell>
                      <TableCell>
                        <span className="font-mono text-[10px]">{item.targetId ?? "None"}</span>
                        <span className="block text-[10px] text-[#687c7b]">HTTP {item.statusCode}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </AdminDataState>

        <aside className="h-fit rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)] p-5 2xl:sticky 2xl:top-24">
          {!subject ? (
            <div className="py-8 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-[#f3d54e]" />
              <h2 className="mt-4 text-base font-bold">Subject detail</h2>
              <p className="mx-auto mt-2 max-w-[28ch] text-xs leading-relaxed text-[#82908b]">
                An anonymous identity or hashed network reference নির্বাচন করলে recent timeline এখানে দেখা যাবে।
              </p>
            </div>
          ) : subjectDetails.isLoading ? (
            <div className="space-y-3 py-4">
              <div className="h-4 w-32 animate-pulse rounded bg-primary/20" />
              <div className="h-20 animate-pulse rounded-xl bg-[#20292b]" />
              <div className="h-32 animate-pulse rounded-xl bg-[#20292b]" />
            </div>
          ) : subjectDetails.isError ? (
            <p className="text-sm text-red-300">{apiMessage(subjectDetails.error)}</p>
          ) : subjectDetails.data ? (
            <SubjectDetail data={subjectDetails.data} onClose={() => setSubject(null)} />
          ) : null}
        </aside>
      </div>
    </>
  );
}

function SubjectRef({ kind, value, onSelect }: { kind: Subject["kind"]; value?: string; onSelect: (value: Subject) => void }) {
  if (!value) return <span className="text-xs text-[#687c7b]">Not available</span>;
  return (
    <button className="font-mono text-[10px] text-[#f3d54e] hover:underline" onClick={() => onSelect({ kind, ref: value })}>
      {value.slice(0, 8)}...{value.slice(-4)}
    </button>
  );
}

function SubjectButtons({ item, onSelect }: { item: MonitoringEvent; onSelect: (value: Subject) => void }) {
  return (
    <>
      {item.actorRef && <Button size="sm" variant="ghost" onClick={() => onSelect({ kind: "actor", ref: item.actorRef! })}><UserRoundSearch /> Identity</Button>}
      {item.networkRef && <Button size="sm" variant="ghost" onClick={() => onSelect({ kind: "network", ref: item.networkRef! })}><Network /> Network</Button>}
    </>
  );
}

function SubjectDetail({ data, onClose }: { data: Awaited<ReturnType<typeof adminApi.monitoringSubject>>; onClose: () => void }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[#f3d54e]">
            {data.subject.kind === "actor" ? <UserRoundSearch className="h-4 w-4" /> : <Network className="h-4 w-4" />}
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">{data.subject.kind}</span>
          </div>
          <h2 className="mt-2 break-all font-mono text-xs">{data.subject.ref}</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-2">
        {Object.entries(data.totals).map(([label, value]) => (
          <div key={label} className="rounded-[10px] border border-[#2e383a] bg-[#111719] p-3">
            <dt className="text-[9px] uppercase tracking-[0.1em] text-[#687c7b]">{label}</dt>
            <dd className="mt-1 font-mono text-xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex items-center gap-2 text-xs font-bold"><Activity className="h-4 w-4 text-[#f3d54e]" /> Recent timeline</div>
      <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {data.timeline.map((item) => (
          <div key={item.id} className="rounded-[10px] border border-[#273134] bg-[#111719] p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold capitalize">{item.action}</span><ResultBadge result={item.result} /></div>
            <p className="mt-2 text-[11px] text-[#9fada7]">{reasonLabel(item.reason)}</p>
            <time className="mt-1 block font-mono text-[9px] text-[#687c7b]">{new Date(item.createdAt).toLocaleString()}</time>
          </div>
        ))}
      </div>
    </>
  );
}

