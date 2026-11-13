import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileWarning, Flag, MessageSquareText, ShieldCheck } from "lucide-react";

import {
  AdminDataState,
  AdminMetric,
  AdminPageHeader,
  StatusBadge,
} from "@/components/admin/AdminUi";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/")({ component: AdminDashboard });

function AdminDashboard() {
  const dashboard = useQuery({ queryKey: ["admin-dashboard"], queryFn: adminApi.dashboard });
  const flags = useQuery({
    queryKey: ["admin-dashboard-flags"],
    queryFn: () => adminApi.flags({ reviewStatus: "pending", page: 1, pageSize: 4 }),
  });
  const incidents = useQuery({
    queryKey: ["admin-dashboard-incidents"],
    queryFn: () => adminApi.incidents({ page: 1, pageSize: 3, sort: "newest" }),
  });
  const audit = useQuery({
    queryKey: ["admin-dashboard-audit"],
    queryFn: () => adminApi.audit({ page: 1, pageSize: 4, sort: "newest" }),
  });
  const data = dashboard.data;
  const loading = dashboard.isLoading || flags.isLoading || incidents.isLoading || audit.isLoading;
  const error = dashboard.error || flags.error || incidents.error || audit.error;
  return (
    <>
      <AdminPageHeader
        eyebrow="Operations / 01"
        title="সড়কের রিপোর্ট, দায়িত্বশীল সিদ্ধান্ত।"
        description="এক জায়গায় Report, Moderation, Risk ও Audit পর্যবেক্ষণ।"
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-[#445343] bg-[#24372d] px-3 py-2 text-[10px] font-extrabold text-[#8be6b2]">
            <i className="h-1.5 w-1.5 rounded-full bg-[#74dfa8]" /> LIVE OPERATIONS
          </span>
        }
      />
      <AdminDataState loading={loading} error={error ? apiMessage(error) : undefined} empty={!data}>
        {data && (
          <div className="space-y-[19px]">
            <section className="grid gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
              <AdminMetric
                label="New incidents today"
                value={data.today.incidents}
                detail={`${data.totals.incidents} total incidents`}
              />
              <AdminMetric
                label="Open flag reports"
                value={data.totals.openFlags}
                detail={`${data.today.flags} received today`}
              />
              <AdminMetric
                label="Hidden content"
                value={data.waitingForReview.hiddenIncidents + data.waitingForReview.hiddenComments}
                detail="Pending human review"
              />
              <AdminMetric
                label="Comments today"
                value={data.today.comments}
                detail={`${data.totals.comments} total comments`}
              />
            </section>

            <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)]">
              <section className="overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)]">
                <PanelTitle
                  title="Review queue"
                  detail="সবচেয়ে আগে pending flag reports পর্যালোচনা করুন"
                  to="/admin/flags"
                  label="View all"
                />
                <div className="px-1">
                  {(flags.data?.items ?? []).map((item) => (
                    <div
                      key={item._id}
                      className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#273134] px-[18px] py-4 last:border-0"
                    >
                      <span className="grid h-[37px] w-[37px] place-items-center rounded-[11px] bg-[#2a2520] text-[#f0a34a]">
                        {item.targetType === "incident" ? (
                          <Flag className="h-[18px] w-[18px]" />
                        ) : (
                          <MessageSquareText className="h-[18px] w-[18px]" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <b className="block truncate text-xs">
                          {item.reason} · {item.targetId}
                        </b>
                        <small className="mt-1 block text-[10px] text-[#82908b]">
                          {item.targetType} · {new Date(item.createdAt).toLocaleString()}
                        </small>
                      </div>
                      <Button asChild size="sm" variant="asphalt">
                        <Link to="/admin/flags">Review</Link>
                      </Button>
                    </div>
                  ))}
                  {!flags.data?.items.length && (
                    <p className="p-8 text-center text-xs text-[#82908b]">
                      No pending flag reports.
                    </p>
                  )}
                </div>
              </section>
              <section className="overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)]">
                <div className="border-b border-[#273134] px-[21px] py-[19px]">
                  <h2 className="font-bold">Platform activity</h2>
                  <p className="mt-1 text-[11px] text-[#82908b]">Current operational totals</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-[#273134]">
                  {[
                    ["Incidents", data.totals.incidents],
                    ["Comments", data.totals.comments],
                    ["Votes", data.totals.votes],
                    ["Open flags", data.totals.openFlags],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[#161e20] px-5 py-5">
                      <strong className="font-mono text-2xl">{value}</strong>
                      <p className="mt-1 text-[10px] text-[#82908b]">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 border-t border-[#273134] px-5 py-4 text-[11px] leading-relaxed text-[#afbdac]">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-[#f3d54e]" />
                  <p>
                    <b className="block text-[#f0d881]">Human moderation only</b>Support বা
                    Dispute-এর সংখ্যা দিয়ে রিপোর্টের সত্য-মিথ্যা নির্ধারণ করা হয় না।
                  </p>
                </div>
              </section>
            </div>

            <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)]">
              <section className="overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)]">
                <PanelTitle
                  title="Recent incident reports"
                  detail="Fast access to content review and context"
                  to="/admin/incidents"
                  label="Manage incidents"
                />
                {(incidents.data?.items ?? []).map((item) => (
                  <div
                    key={item.trackingId}
                    className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#273134] px-[18px] py-4 last:border-0"
                  >
                    <span className="grid h-[37px] w-[37px] place-items-center rounded-[11px] bg-[#242d30] text-[#8bb8e6]">
                      <FileWarning className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <b className="block truncate text-xs">{item.title}</b>
                      <small className="mt-1 block text-[10px] text-[#82908b]">
                        {item.areaName} · {new Date(item.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <StatusBadge value={item.status} />
                  </div>
                ))}
              </section>
              <section className="overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)]">
                <PanelTitle
                  title="Audit trail"
                  detail="Moderation decisions are traceable"
                  to="/admin/audit"
                  label="Audit log"
                />
                <div className="px-[19px] py-1">
                  {(audit.data?.items ?? []).map((item) => (
                    <div
                      key={item._id}
                      className="grid grid-cols-[12px_1fr_auto] gap-2.5 border-b border-[#273134] py-3 text-[11px] last:border-0"
                    >
                      <span className="mt-1.5 h-2 w-2 rounded-full border-2 border-[#60ca9b]" />
                      <div>
                        <b className="block">
                          {item.action} <span className="text-[#82908b]">· {item.targetId}</span>
                        </b>
                        <small className="text-[#82908b]">
                          {item.adminId?.email ?? "Admin"} · {item.reason}
                        </small>
                      </div>
                      <time className="text-[10px] text-[#718780]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </time>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </AdminDataState>
    </>
  );
}

function PanelTitle({
  title,
  detail,
  to,
  label,
}: {
  title: string;
  detail: string;
  to: "/admin/flags" | "/admin/incidents" | "/admin/audit";
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#273134] px-[21px] py-[19px]">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        <p className="mt-1 text-[11px] text-[#82908b]">{detail}</p>
      </div>
      <Link
        to={to}
        className="flex items-center gap-1 text-[11px] font-bold text-[#f3d54e] hover:underline"
      >
        {label} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
