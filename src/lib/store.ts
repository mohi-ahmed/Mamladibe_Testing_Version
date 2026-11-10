import { useMemo, useSyncExternalStore } from "react";
import {
  DEMO_TRACKING,
  RULES,
  SEED_COMMENTS,
  SEED_INCIDENTS,
  type Incident,
  type IncidentComment,
} from "./incidents";

/*
 * UI-demo store. Everything lives in this browser (localStorage).
 * In production these rules are enforced by the server (see SRS FR-037, FR-057, FR-081).
 */

type Vote = "support" | "dispute";
interface Version {
  title: string;
  description: string;
  safetyTip?: string | undefined;
  savedAt: number;
}
interface State {
  reports: Incident[];
  secrets: Record<string, string>;
  edits: Record<string, Partial<Incident>>;
  versions: Record<string, Version[]>;
  votes: Record<string, Vote>;
  flags: Record<string, string>;
  comments: IncidentComment[];
  deletedComments: string[];
  commentFlags: Record<string, string>;
  commentLog: number[];
}

const KEY = "mamladibe:v1";
const EMPTY: State = {
  reports: [],
  secrets: { [DEMO_TRACKING.trackingId]: DEMO_TRACKING.secret },
  edits: {},
  versions: {},
  votes: {},
  flags: {},
  comments: [],
  deletedComments: [],
  commentFlags: {},
  commentLog: [],
};

let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw)
      state = {
        ...EMPTY,
        ...JSON.parse(raw),
        secrets: { ...EMPTY.secrets, ...JSON.parse(raw).secrets },
      };
  } catch {
    state = EMPTY;
  }
}

function set(updater: (s: State) => State) {
  load();
  state = updater(state);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getSnapshot = () => {
  load();
  return state;
};
const getServerSnapshot = () => EMPTY;

export function useStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function mergeIncident(i: Incident, s: State): Incident {
  const e = s.edits[i.id];
  const v = s.votes[i.id];
  const userComments = s.comments.filter(
    (c) => c.incidentId === i.id && !s.deletedComments.includes(c.id),
  ).length;
  return {
    ...i,
    ...e,
    support: i.support + (v === "support" ? 1 : 0),
    dispute: i.dispute + (v === "dispute" ? 1 : 0),
    flags: i.flags + (s.flags[i.id] ? 1 : 0),
    commentCount: i.commentCount + userComments,
  };
}

export function useIncidents() {
  const s = useStore();
  return useMemo(
    () =>
      [...s.reports, ...SEED_INCIDENTS]
        .map((i) => mergeIncident(i, s))
        .sort((a, b) => b.createdAt - a.createdAt),
    [s],
  );
}

export function useIncident(id: string) {
  const all = useIncidents();
  return all.find((i) => i.id === id);
}

export function useMyVote(id: string) {
  return useStore().votes[id];
}

export function useComments(id: string) {
  const s = useStore();
  return useMemo(() => {
    const mine = s.comments.filter((c) => c.incidentId === id).map((c) => ({ ...c, mine: true }));
    return [...mine, ...SEED_COMMENTS.filter((c) => c.incidentId === id)]
      .filter((c) => !s.deletedComments.includes(c.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [s, id]);
}

/* ---------- Actions ---------- */

/** One active vote per incident; clicking the same vote again removes it, the other one switches it. */
export function castVote(id: string, vote: Vote) {
  set((s) => {
    const votes = { ...s.votes };
    if (votes[id] === vote) delete votes[id];
    else votes[id] = vote;
    return { ...s, votes };
  });
}

export function flagIncident(id: string, reason: string): { ok: boolean; message: string } {
  load();
  if (state.flags[id]) return { ok: false, message: "আপনি এই ঘটনাটি আগেই ফ্ল্যাগ করেছেন।" };
  set((s) => ({ ...s, flags: { ...s.flags, [id]: reason } }));
  return { ok: true, message: "ধন্যবাদ। মডারেটর টিম এটি পর্যালোচনা করবে।" };
}

export function hasFlagged(id: string) {
  return Boolean(getSnapshot().flags[id]);
}

export function commentsLeftToday(now = Date.now()) {
  const recent = getSnapshot().commentLog.filter((t) => now - t < 24 * 60 * 60 * 1000);
  return Math.max(0, RULES.commentsPerDay - recent.length);
}

export function addComment(c: Omit<IncidentComment, "id" | "createdAt">): {
  ok: boolean;
  message: string;
} {
  const now = Date.now();
  if (commentsLeftToday(now) <= 0)
    return { ok: false, message: "আজকের ৫টি মন্তব্যের সীমা শেষ। ২৪ ঘণ্টা পর আবার চেষ্টা করুন।" };
  set((s) => ({
    ...s,
    comments: [{ ...c, id: `u-${now}`, createdAt: now }, ...s.comments],
    commentLog: [...s.commentLog.filter((t) => now - t < 86_400_000), now],
  }));
  return { ok: true, message: "মন্তব্য যোগ হয়েছে।" };
}

export function flagComment(id: string, reason: string): { ok: boolean; message: string } {
  if (getSnapshot().commentFlags[id])
    return { ok: false, message: "এই মন্তব্যটি আগেই ফ্ল্যাগ করেছেন।" };
  set((s) => ({ ...s, commentFlags: { ...s.commentFlags, [id]: reason } }));
  return { ok: true, message: "মন্তব্যটি পর্যালোচনার জন্য পাঠানো হয়েছে।" };
}

export function publishReport(incident: Incident, secret: string) {
  set((s) => ({
    ...s,
    reports: [incident, ...s.reports],
    secrets: { ...s.secrets, [incident.trackingId]: secret },
  }));
}

/** Generic failure: never reveals which credential was wrong (FR-048). */
export function lookupReport(trackingId: string, secret: string): Incident | null {
  const s = getSnapshot();
  const tid = trackingId.trim().toUpperCase();
  if (!s.secrets[tid] || s.secrets[tid] !== secret.trim().toUpperCase()) return null;
  const base = [...s.reports, ...SEED_INCIDENTS].find((i) => i.trackingId === tid);
  if (!base) return null;
  // The demo report always starts with a fresh 15-minute window.
  const withDemo =
    tid === DEMO_TRACKING.trackingId && !s.edits[base.id]?.createdAt
      ? { ...base, createdAt: Date.now() - 5 * 60_000 }
      : base;
  if (withDemo !== base) {
    set((st) => ({
      ...st,
      edits: { ...st.edits, [base.id]: { ...st.edits[base.id], createdAt: withDemo.createdAt } },
    }));
  }
  return mergeIncident(withDemo, getSnapshot());
}

export function saveQuickEdit(
  inc: Incident,
  next: { title: string; description: string; safetyTip?: string | undefined },
) {
  const now = Date.now();
  set((s) => ({
    ...s,
    versions: {
      ...s.versions,
      [inc.id]: [
        ...(s.versions[inc.id] ?? []),
        { title: inc.title, description: inc.description, safetyTip: inc.safetyTip, savedAt: now },
      ],
    },
    edits: { ...s.edits, [inc.id]: { ...s.edits[inc.id], ...next, isEdited: true, editedAt: now } },
  }));
}

export function useVersions(id: string) {
  return useStore().versions[id] ?? [];
}
