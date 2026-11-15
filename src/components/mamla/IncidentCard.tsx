import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Lightbulb,
  MapPin,
  MessageCircle,
  Pencil,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiMessage, type VoteResult } from "@/lib/api";
import { bn, categoryById, timeAgo, type Incident } from "@/lib/incidents";
import { applyVoteResult, castVote, incidentKeys } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RoadSign, catStyle } from "./RoadSign";
import { IncidentShare } from "./IncidentShare";

export function IncidentCard({
  incident,
  className,
  index = 0,
}: {
  incident: Incident;
  className?: string;
  index?: number;
}) {
  const cat = categoryById(incident.category);
  const queryClient = useQueryClient();
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    void api.ensureIdentity().catch(() => undefined);
  }, []);

  const voteFor = async (kind: "support" | "dispute") => {
    if (voting) return;
    const previous = queryClient.getQueriesData({ queryKey: incidentKeys.all });
    const currentVote = incident.viewerState.vote;
    const nextVote = currentVote === kind ? null : kind;
    const optimistic: VoteResult = {
      vote: nextVote,
      counts: {
        support: Math.max(
          0,
          incident.support - (currentVote === "support" ? 1 : 0) + (nextVote === "support" ? 1 : 0),
        ),
        dispute: Math.max(
          0,
          incident.dispute - (currentVote === "dispute" ? 1 : 0) + (nextVote === "dispute" ? 1 : 0),
        ),
        flags: incident.flags,
        comments: incident.commentCount,
      },
    };

    setVoting(true);
    queryClient.setQueriesData({ queryKey: incidentKeys.all }, (data) =>
      applyVoteResult(data, incident.trackingId, optimistic),
    );
    try {
      const result = await castVote(incident, kind);
      queryClient.setQueriesData({ queryKey: incidentKeys.all }, (data) =>
        applyVoteResult(data, incident.trackingId, result),
      );
    } catch (error) {
      for (const [key, data] of previous) queryClient.setQueryData(key, data);
      toast.error(apiMessage(error));
    } finally {
      setVoting(false);
    }
  };

  return (
    <article
      style={{ ...catStyle(incident.category), animationDelay: `${index * 60}ms` }}
      className={cn(
        "asphalt-panel group relative flex animate-rise flex-col overflow-hidden rounded-2xl border border-border p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--cat)]/60",
        className,
      )}
    >
      <Link
        to="/incidents/$id"
        params={{ id: incident.id }}
        aria-label={`${incident.title} বিস্তারিত দেখুন`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <span className="absolute inset-y-0 left-0 w-1 bg-[color:var(--cat)] opacity-80" />
      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <RoadSign
            category={incident.category}
            size={38}
            className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          />
          <div className="leading-tight">
            <div className="text-xs font-bold text-[color:var(--cat)]">{cat.bn}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {incident.trackingId}
            </div>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {timeAgo(incident.createdAt)}
        </span>
      </div>

      <h3 className="pointer-events-none relative z-10 mt-4 text-lg font-bold leading-snug text-balance group-hover:text-primary">
        {incident.title}
      </h3>
      <p className="pointer-events-none relative z-10 mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {incident.description}
      </p>

      <div className="pointer-events-none relative z-10 mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">
          {incident.roadName ? `${incident.roadName} · ` : ""}
          {incident.areaName}
        </span>
      </div>

      <div className="pointer-events-none relative z-10 mt-5 flex items-center justify-between border-t border-dashed border-border pt-4">
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button
            type="button"
            disabled={voting}
            aria-pressed={incident.viewerState.vote === "support"}
            aria-label="সমর্থন দিন"
            data-testid={`card-vote-support-${incident.trackingId}`}
            onClick={() => void voteFor("support")}
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-support transition-colors hover:bg-support/10 disabled:cursor-wait disabled:opacity-60",
              incident.viewerState.vote === "support" && "bg-support/15 ring-1 ring-support/40",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {bn(incident.support)}
          </button>
          <button
            type="button"
            disabled={voting}
            aria-pressed={incident.viewerState.vote === "dispute"}
            aria-label="আপত্তি দিন"
            data-testid={`card-vote-dispute-${incident.trackingId}`}
            onClick={() => void voteFor("dispute")}
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-dispute transition-colors hover:bg-dispute/10 disabled:cursor-wait disabled:opacity-60",
              incident.viewerState.vote === "dispute" && "bg-dispute/15 ring-1 ring-dispute/40",
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {bn(incident.dispute)}
          </button>
          <Link
            to="/incidents/$id"
            params={{ id: incident.id }}
            hash="comments"
            aria-label="মন্তব্য দেখুন বা যোগ করুন"
            className="pointer-events-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {bn(incident.commentCount)}
          </Link>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <IncidentShare incident={incident} iconOnly />
          {incident.safetyTip && (
            <Lightbulb className="h-4 w-4 text-primary" aria-label="সেফটি টিপ আছে" />
          )}
          {incident.isEdited && <Pencil className="h-3.5 w-3.5" aria-label="সম্পাদিত" />}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        </div>
      </div>
    </article>
  );
}
