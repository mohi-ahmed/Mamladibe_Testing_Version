import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AdminPageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-[26px]">
      {eyebrow && (
        <div className="mb-3 flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-[#f3d54e] before:h-[3px] before:w-[23px] before:bg-[repeating-linear-gradient(90deg,#f3d54e_0_12px,transparent_12px_18px)] before:content-['']">
          {eyebrow}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[clamp(27px,2.6vw,39px)] font-extrabold leading-tight tracking-[-0.055em]">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-xs text-[#82908b]">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "published" || value === "active" || value === "kept"
      ? "border-support/35 bg-support/10 text-support"
      : value === "hidden" || value === "pending"
        ? "border-primary/35 bg-primary/10 text-primary"
        : "border-destructive/35 bg-destructive/10 text-red-300";
  return (
    <span
      className={cn(
        "inline-flex rounded-[7px] border px-2 py-1 font-mono text-[10px] font-bold uppercase",
        tone,
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function AdminDataState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="grid min-h-56 place-items-center rounded-[14px] border border-[#2e383a] bg-[#161e20]">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  if (error)
    return (
      <div className="grid min-h-56 place-items-center rounded-[14px] border border-destructive/30 bg-destructive/5 px-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-7 w-7 text-red-300" />
          <p className="mt-3 text-sm text-red-200">{error}</p>
        </div>
      </div>
    );
  if (empty)
    return (
      <div className="grid min-h-56 place-items-center rounded-[14px] border border-[#2e383a] bg-[#161e20] px-6 text-center">
        <div>
          <Inbox className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">কোনো matching record পাওয়া যায়নি।</p>
        </div>
      </div>
    );
  return children;
}

export function AdminMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="relative min-h-[134px] overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)] p-[18px_19px] shadow-[0_15px_38px_#0000001f] after:absolute after:-right-[26px] after:-top-[30px] after:h-[90px] after:w-[90px] after:rounded-full after:border-[22px] after:border-white/[0.02] after:content-['']">
      <p className="text-[11px] font-semibold text-[#82908b]">{label}</p>
      <p className="mt-4 font-mono text-[34px] font-bold leading-none tracking-[-0.07em] tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-[10px] text-[#859790]">{detail}</p>
    </div>
  );
}

export function AdminMobileList({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:hidden">{children}</div>;
}

export function AdminMobileCard({
  eyebrow,
  title,
  status,
  children,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#2e383a] bg-[linear-gradient(145deg,#161e20,#131a1d)] shadow-[0_12px_30px_#00000024]">
      <div className="flex items-start justify-between gap-3 border-b border-[#273134] px-4 py-3.5">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 truncate font-mono text-[10px] font-bold text-[#f3d54e]">
              {eyebrow}
            </div>
          )}
          <h2 className="break-words text-sm font-bold leading-snug text-[#eef0e8]">{title}</h2>
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">{children}</dl>
      {actions && (
        <div className="flex flex-wrap justify-end gap-1.5 border-t border-[#273134] px-3 py-3">
          {actions}
        </div>
      )}
    </article>
  );
}

export function AdminMobileField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#687c7b]">
        {label}
      </dt>
      <dd className="break-words text-xs leading-relaxed text-[#b9c4bf]">{children}</dd>
    </div>
  );
}

export function AdminActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!open) {
      setReason("");
      setError("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="grid gap-2">
          <Label htmlFor="admin-action-reason">Reason</Label>
          <Textarea
            id="admin-action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={500}
            placeholder="এই সিদ্ধান্তের নির্দিষ্ট কারণ লিখুন"
          />
          <p className="text-[11px] text-muted-foreground">
            Audit log-এ reason অপরিবর্তনীয়ভাবে সংরক্ষিত হবে।
          </p>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={working || reason.trim().length < 5}
            onClick={async () => {
              setWorking(true);
              setError("");
              try {
                await onConfirm(reason.trim());
                onOpenChange(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Action failed.");
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? "Saving..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
