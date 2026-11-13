import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Blocks,
  ClipboardList,
  FileWarning,
  Flag,
  Gauge,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { Logo } from "@/components/mamla/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type SearchState = { value: string; setValue: (value: string) => void };
const AdminSearchContext = createContext<SearchState>({ value: "", setValue: () => undefined });
export const useAdminSearch = () => useContext(AdminSearchContext);

const nav = [
  { to: "/admin", label: "Dashboard", icon: Gauge },
  { to: "/admin/incidents", label: "Incidents", icon: FileWarning },
  { to: "/admin/comments", label: "Comments", icon: MessageSquareText },
  { to: "/admin/flags", label: "Flag reports", icon: Flag, count: true },
  { to: "/admin/activity", label: "Anonymous actors", icon: Activity },
  { to: "/admin/audit", label: "Audit log", icon: ClipboardList },
] as const;

const superNav = [
  { to: "/admin/blocks", label: "Blocks", icon: Blocks },
  { to: "/admin/users", label: "Admin users", icon: Users },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

const titleForPath = (path: string) =>
  [...nav, ...superNav].find((item) => item.to === path)?.label ?? "Dashboard";

function SearchProvider({ children, path }: { children: ReactNode; path: string }) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [path]);
  const state = useMemo(() => ({ value, setValue }), [value]);
  return <AdminSearchContext.Provider value={state}>{children}</AdminSearchContext.Provider>;
}

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isPublicAuth = location.pathname === "/admin/login" || location.pathname === "/admin/enrol";
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: adminApi.session,
    enabled: !isPublicAuth,
    retry: false,
    staleTime: 30_000,
  });
  const pendingFlags = useQuery({
    queryKey: ["admin-shell-pending-flags"],
    queryFn: () => adminApi.flags({ reviewStatus: "pending", page: 1, pageSize: 1 }),
    enabled: Boolean(session.data),
    staleTime: 30_000,
  });

  if (isPublicAuth) return <Outlet />;
  if (session.isLoading) {
    return (
      <div className="admin-surface grid min-h-[100dvh] place-items-center bg-[#0c1114]">
        <div className="w-full max-w-sm space-y-3 px-6" aria-label="Admin session যাচাই হচ্ছে">
          <div className="h-3 w-28 animate-pulse rounded bg-primary/25" />
          <div className="h-10 animate-pulse rounded-xl bg-[#161e20]" />
          <div className="h-24 animate-pulse rounded-xl bg-[#161e20]" />
        </div>
      </div>
    );
  }
  if (session.isError || !session.data) {
    void navigate({ to: "/admin/login", replace: true });
    return null;
  }

  const admin = session.data.admin;
  const items = admin.role === "super_admin" ? [...nav, ...superNav] : nav;
  return (
    <SearchProvider path={location.pathname}>
      <AdminFrame
        admin={admin}
        items={items}
        pendingCount={pendingFlags.data?.pagination.totalItems ?? 0}
        open={open}
        setOpen={setOpen}
        path={location.pathname}
        onLogout={async () => {
          await adminApi.logout();
          await navigate({ to: "/admin/login", replace: true });
        }}
      />
    </SearchProvider>
  );
}

function AdminFrame({
  admin,
  items,
  pendingCount,
  open,
  setOpen,
  path,
  onLogout,
}: {
  admin: { email: string; role: "moderator" | "super_admin" };
  items: Array<(typeof nav)[number] | (typeof superNav)[number]>;
  pendingCount: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  path: string;
  onLogout: () => Promise<void>;
}) {
  const search = useAdminSearch();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => setMobileSearchOpen(false), [path]);

  return (
    <div className="admin-surface min-h-[100dvh] bg-[#0c1114] text-[#eef0e8]">
      <div
        className={cn("fixed inset-0 z-30 bg-black/70 lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[255px] flex-col border-r border-[#2e383a] bg-[#101719] px-[13px] pb-4 pt-[26px] transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-3 pb-5">
          <Logo />
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Menu বন্ধ করুন"
          >
            <X />
          </Button>
        </div>
        <div className="px-4 pb-[11px] pt-[15px] text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#687c7b]">
          Workspace
        </div>
        <nav className="grid gap-1" aria-label="Admin navigation">
          {items.map((item) => {
            const Icon = item.icon;
            const showCount = "count" in item && item.count && pendingCount > 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/admin" }}
                activeProps={{
                  className:
                    "!border-[#55502a] !bg-[#292b20] !text-[#f3d54e] shadow-[inset_3px_0_0_#f3d54e]",
                }}
                className="flex h-11 items-center gap-[13px] rounded-[11px] border border-transparent px-[13px] text-sm font-semibold text-[#9daaa6] transition-colors hover:bg-[#1a2224] hover:text-[#eef0e8]"
                onClick={() => setOpen(false)}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                <span>{item.label}</span>
                {showCount && (
                  <span className="ml-auto rounded-md bg-[#493a25] px-[7px] py-[5px] text-[10px] font-bold leading-none text-[#f0a34a]">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="rounded-[14px] border border-[#3a4031] bg-[radial-gradient(circle_at_90%_0,#37351c,transparent_65%),#161c1b] p-[14px]">
            <small className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#82908b]">
              Control status
            </small>
            <p className="my-2 text-xs leading-relaxed text-[#b5c3bc]">
              <span className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-[#60ca9b] shadow-[0_0_0_4px_#60ca9b20]" />
              Admin Console online
              <br />
              Live database connected
            </p>
            <span className="inline-flex rounded-md border border-[#395673] bg-[#21354b] px-2 py-1 text-[10px] font-bold text-[#8bb8e6]">
              PRIVATE AREA
            </span>
          </div>
          <button
            className="mt-3 flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-xs text-[#82908b] hover:bg-[#1a2224] hover:text-[#eef0e8]"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <div className="px-3 pt-2 text-[10px] uppercase leading-relaxed text-[#61746f]">
            © 2026 Team Epsilon
            <br />
            Production console
          </div>
        </div>
      </aside>

      <div className="lg:pl-[255px]">
        <header className="sticky top-0 z-20 flex h-[77px] items-center justify-between gap-4 border-b border-[#2e383a] bg-[#0c1114e8] px-[clamp(18px,3.2vw,48px)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Menu খুলুন"
            >
              <Menu />
            </Button>
            <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#82908b]">
              <span className="hidden sm:inline">Workspace</span>
              <span className="hidden text-[#55615b] sm:inline">/</span>
              <span>Admin</span>
              <span className="text-[#55615b]">/</span>
              <b className="text-xs text-[#eef0e8]">{titleForPath(path)}</b>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSearchOpen((current) => !current)}
              aria-expanded={mobileSearchOpen}
              aria-controls="admin-mobile-search"
              aria-label={mobileSearchOpen ? "Search বন্ধ করুন" : "বর্তমান পেজে Search করুন"}
            >
              {mobileSearchOpen ? <X /> : <Search />}
            </Button>
            <div className="relative hidden w-[220px] md:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#748581]" />
              <Input
                value={search.value}
                onChange={(event) => search.setValue(event.target.value)}
                placeholder="Search active page..."
                aria-label="Search the current admin page"
                className="h-[37px] rounded-[10px] border-[#2e383a] bg-[#151d1f] pl-9 text-xs text-[#eef0e8] placeholder:text-[#748581]"
              />
            </div>
            <div className="flex h-[38px] items-center gap-2 rounded-[10px] border border-[#2e383a] bg-[#171e20] px-2.5">
              <span className="hidden text-[10px] uppercase tracking-[0.07em] text-[#82908b] sm:inline">
                Role
              </span>
              <strong className="text-[11px] font-bold uppercase text-[#f3d54e]">
                {admin.role === "super_admin" ? "Super Admin" : "Moderator"}
              </strong>
            </div>
            <div
              className="grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-[#716333] bg-[#433c20] text-xs font-extrabold text-[#f3d54e]"
              title={admin.email}
            >
              {admin.email.charAt(0).toUpperCase()}
            </div>
          </div>
          {mobileSearchOpen && (
            <div
              id="admin-mobile-search"
              className="absolute inset-x-0 top-[76px] border-b border-[#2e383a] bg-[#0c1114f5] p-3 shadow-[0_16px_30px_#0008] backdrop-blur-xl md:hidden"
            >
              <div className="relative mx-auto max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#748581]" />
                <Input
                  autoFocus
                  value={search.value}
                  onChange={(event) => search.setValue(event.target.value)}
                  placeholder="Search active page..."
                  aria-label="Search the current admin page"
                  className="h-10 rounded-[10px] border-[#465453] bg-[#151d1f] pl-9 pr-10 text-sm text-[#eef0e8] placeholder:text-[#748581]"
                />
                {search.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10"
                    onClick={() => search.setValue("")}
                    aria-label="Search পরিষ্কার করুন"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1550px] px-[clamp(16px,3.2vw,48px)] pb-[70px] pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
