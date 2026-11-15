import { Check, Copy, Facebook, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Incident } from "@/lib/incidents";
import { cn } from "@/lib/utils";

function incidentShareData(incident: Incident) {
  const shareUrl = new URL(`/incidents/${incident.id}`, window.location.origin);
  // Version the shared URL so social crawlers do not reuse an older preview
  // after Open Graph image or metadata updates. The route ignores this value.
  shareUrl.searchParams.set("share", "2");
  const url = shareUrl.toString();
  return {
    title: `${incident.title} — Mamladibe`,
    text: `${incident.title}\n${incident.areaName} — Mamladibe`,
    url,
  };
}

function openShareUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer,width=720,height=640");
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function IncidentShare({
  incident,
  iconOnly = false,
  className,
}: {
  incident: Incident;
  iconOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const data = incidentShareData(incident);
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && navigator.share) {
      try {
        await navigator.share(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOpen(true);
      }
      return;
    }
    setOpen(true);
  };

  const data = typeof window === "undefined" ? null : incidentShareData(incident);

  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        aria-label="ঘটনাটি শেয়ার করুন"
        className={cn(
          iconOnly
            ? "pointer-events-auto inline-flex rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
            : "inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold transition-colors hover:border-primary/50 hover:text-primary",
          className,
        )}
      >
        <Share2 className="h-4 w-4" />
        {!iconOnly && "শেয়ার করুন"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ঘটনাটি শেয়ার করুন</DialogTitle>
            <DialogDescription>
              শুধু প্রকাশিত incident link শেয়ার হবে—কোনো Secret বা edit তথ্য নয়।
            </DialogDescription>
          </DialogHeader>
          {data && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                type="button"
                variant="asphalt"
                onClick={() =>
                  openShareUrl(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.url)}`,
                  )
                }
              >
                <Facebook /> Facebook
              </Button>
              <Button
                type="button"
                variant="asphalt"
                onClick={() =>
                  openShareUrl(
                    `https://wa.me/?text=${encodeURIComponent(`${data.text}\n${data.url}`)}`,
                  )
                }
              >
                <Send /> WhatsApp
              </Button>
              <Button
                type="button"
                variant="asphalt"
                onClick={() =>
                  openShareUrl(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(data.text)}&url=${encodeURIComponent(data.url)}`,
                  )
                }
              >
                <span className="font-bold">𝕏</span> X
              </Button>
              <Button
                type="button"
                variant="road"
                onClick={async () => {
                  try {
                    await copyText(data.url);
                    setCopied(true);
                    toast.success("লিংক কপি হয়েছে।");
                    window.setTimeout(() => setCopied(false), 2_000);
                  } catch {
                    toast.error("লিংক কপি করা যায়নি।");
                  }
                }}
              >
                {copied ? <Check /> : <Copy />} {copied ? "কপি হয়েছে" : "লিংক কপি"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
