import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/mamla/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/enrol")({
  head: () => ({
    meta: [
      { title: "Admin enrolment | Mamladibe" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminEnrol,
});

function AdminEnrol() {
  const [step, setStep] = useState<"credentials" | "totp" | "done">("credentials");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await adminApi.enrolStart({ token: token.trim(), password });
      setOtpauthUri(result.otpauthUri);
      setStep("totp");
    } catch (cause) {
      setError(apiMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await adminApi.enrolVerify(totpCode);
      setStep("done");
    } catch (cause) {
      setError(apiMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-surface grid min-h-[100dvh] place-items-center bg-asphalt-deep px-5 py-10">
      <main className="w-full max-w-xl border border-border bg-[#111719] p-6 shadow-2xl sm:p-9">
        <Logo />
        <div className="mt-8 flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            {step === "done" ? <CheckCircle2 /> : <ShieldCheck />}
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              Protected setup
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Admin account enrolment</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              One-time token, a strong password and an authenticator app are required.
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "credentials" && (
          <form className="mt-7 grid gap-5" onSubmit={start}>
            <div className="grid gap-2">
              <Label htmlFor="enrol-token">One-time enrolment token</Label>
              <Input
                id="enrol-token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                minLength={32}
                autoComplete="off"
                required
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="enrol-password">Password</Label>
                <Input
                  id="enrol-password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="enrol-confirm">Confirm password</Label>
                <Input
                  id="enrol-confirm"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" size="lg" disabled={submitting}>
              <KeyRound /> {submitting ? "Preparing…" : "Continue to authenticator"}
            </Button>
          </form>
        )}

        {step === "totp" && (
          <form className="mt-7 grid gap-5" onSubmit={verify}>
            <div className="border border-primary/25 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Add this account to your authenticator</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Copy the private URI below and import it in the authenticator app. Never share it.
              </p>
              <div className="mt-3 flex gap-2">
                <Input readOnly value={otpauthUri} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="asphalt"
                  onClick={async () => {
                    await navigator.clipboard.writeText(otpauthUri);
                    toast.success("Authenticator URI copied");
                  }}
                  aria-label="Copy authenticator URI"
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="enrol-totp">6-digit authenticator code</Label>
              <Input
                id="enrol-totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className="font-mono text-lg tracking-[0.3em]"
              />
            </div>
            <Button type="submit" size="lg" disabled={submitting || totpCode.length !== 6}>
              <ShieldCheck /> {submitting ? "Verifying…" : "Verify and activate"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="mt-7 border border-emerald-500/25 bg-emerald-500/5 p-5">
            <p className="font-semibold text-emerald-300">Account activated successfully.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with your email, password and a fresh authenticator code.
            </p>
            <Button asChild className="mt-5">
              <Link to="/admin/login">Go to secure sign in</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
