import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/mamla/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi } from "@/lib/admin-api";
import { apiMessage } from "@/lib/api";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Admin sign in | Mamladibe" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (step === 1) {
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const session = await adminApi.login({ email, password, totpCode });
      queryClient.setQueryData(["admin-session"], session);
      await navigate({ to: "/admin", replace: true });
    } catch (cause) {
      setError(apiMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-surface grid min-h-[100dvh] bg-[#0c1114] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-[#2e383a] bg-[#101719] p-12 lg:flex lg:flex-col">
        <Logo />
        <div className="my-auto max-w-xl">
          <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-[#f3d54e]">
            Protected workspace
          </p>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.08] tracking-tight">
            সংবেদনশীল রিপোর্ট।
            <br />
            নিরাপদ প্রবেশ।
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[#9daaa6]">
            Moderation decisions, anonymous activity and audit records শুধু অনুমোদিত Admin-দের জন্য।
          </p>
          <div className="mt-7 border-l-[3px] border-[#f3d54e] bg-[#27291c] p-3 text-xs leading-relaxed text-[#b4baa9]">
            Public users-এর কোনো account বা login লাগে না। এই প্রবেশপথ শুধু Moderator এবং Super
            Admin-এর জন্য।
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-[#2e383a] pt-5 text-xs text-[#82908b]">
          <span>Argon2id</span>
          <span>TOTP required</span>
          <span>Short session</span>
        </div>
      </section>

      <main className="grid place-items-center px-5 py-10 sm:px-10">
        <form className="w-full max-w-md" onSubmit={submit}>
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#716333] bg-[#292b20] text-[#f3d54e]">
            {step === 1 ? <LockKeyhole className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </span>
          <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#f3d54e]">
            Step {step} of 2
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
            {step === 1 ? "Sign in to console" : "Two-factor verification"}
          </h2>
          <p className="mt-2 text-sm text-[#9daaa6]">
            {step === 1
              ? "Admin email এবং password দিন।"
              : "Authenticator app-এর বর্তমান 6-digit code দিন।"}
          </p>

          {error && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 1 ? (
            <div className="mt-7 grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="admin-email">Email address</Label>
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-11 rounded-[9px] border-[#435050] bg-[#10181a]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-11 rounded-[9px] border-[#435050] bg-[#10181a]"
                />
              </div>
            </div>
          ) : (
            <div className="mt-7 grid gap-2">
              <Label htmlFor="admin-totp">6-digit TOTP code</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[#82908b]" />
                <Input
                  id="admin-totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(event) =>
                    setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  autoFocus
                  className="h-12 rounded-[9px] border-[#435050] bg-[#10181a] pl-11 font-mono text-xl tracking-[0.35em]"
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="mt-7 w-full"
            disabled={
              submitting || !email || password.length < 12 || (step === 2 && totpCode.length !== 6)
            }
          >
            <ShieldCheck />
            {submitting ? "যাচাই হচ্ছে..." : step === 1 ? "Continue to 2FA" : "Secure sign in"}
          </Button>

          {step === 2 && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full text-[#9daaa6]"
              onClick={() => {
                setStep(1);
                setTotpCode("");
                setError("");
              }}
            >
              <ArrowLeft />
              Back to credentials
            </Button>
          )}
          <p className="mt-5 text-center text-xs leading-relaxed text-[#82908b]">
            পাঁচটি ব্যর্থ চেষ্টার পর account সাময়িকভাবে lock হবে।
          </p>
        </form>
      </main>
    </div>
  );
}
