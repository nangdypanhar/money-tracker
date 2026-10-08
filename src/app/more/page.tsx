"use client";

import {
  ChartNoAxesCombined,
  ChevronRight,
  Download,
  Share,
  DatabaseBackup,
  Gauge,
  Landmark,
  LockKeyhole,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Tags,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/app/screen-header";
import { Panel, Segmented } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/app/form";
import { useData } from "@/features/data/data-provider";
import { usePwa } from "@/features/pwa/pwa-provider";
import { useLock } from "@/features/security/lock-provider";
import { clearAppCacheAndReload, resetEverything } from "@/lib/app-cache";
import { deleteDb } from "@/lib/db/idb";
import { DB_NAMES, type DataMode, restartApp, switchDataMode } from "@/lib/db/mode";

const LINKS = [
  { href: "/accounts", label: "Accounts", description: "Cash, bank, e-wallet, credit", icon: Landmark },
  { href: "/goals", label: "Savings goals", description: "Set money aside for a target", icon: PiggyBank },
  { href: "/budget/limits", label: "Budget limits", description: "Monthly and per-category limits", icon: Gauge },
  { href: "/categories", label: "Categories", description: "Income and expense categories", icon: Tags },
  { href: "/budget/report", label: "Reports", description: "Income, cash flow, CSV export", icon: ChartNoAxesCombined },
  { href: "/backup", label: "Backup & restore", description: "Export or import your data", icon: DatabaseBackup },
  { href: "/security", label: "Security", description: "PIN lock", icon: LockKeyhole },
];

export default function MorePage() {
  const { security, lockNow } = useLock();
  const { theme = "system", setTheme } = useTheme();
  const { mode } = useData();
  const pwa = usePwa();
  const { confirm, dialog } = useConfirm();

  async function resetApp() {
    const ok = await confirm(
      "Delete everything?",
      "This deletes ALL MoneyTrack data on this device — your accounts, transactions, budgets, goals, the demo, your PIN, and settings — and starts the app fresh. It can't be undone. Export a backup first if you might need anything.",
      "Delete everything",
    );
    if (!ok) return;
    try {
      await resetEverything();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reset the app.");
    }
  }

  async function resetDemo() {
    if (!(await confirm("Reset demo data?", "The demo goes back to its original sample data. Your own data isn't touched.", "Reset"))) return;
    try {
      await deleteDb(DB_NAMES.demo);
      restartApp();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reset the demo.");
    }
  }
  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader title="More" className="px-0" />

      {!pwa.isInstalled && (
        <Panel className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Download className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Install MoneyTrack</p>
              <p className="text-xs text-muted-foreground">Open it from your home screen and use it offline.</p>
            </div>
          </div>
          {!pwa.isSecure ? (
            <p className="text-xs text-muted-foreground">
              Installing needs a secure (https://) address. This one isn&apos;t, so your browser can only make a plain
              shortcut — offline use and the PIN lock won&apos;t work from it.
            </p>
          ) : pwa.canInstall ? (
            <Button onClick={pwa.install} className="h-11 rounded-full">
              Install app
            </Button>
          ) : pwa.isIos ? (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              In Safari, tap <Share className="inline size-3.5" /> <span className="font-medium text-foreground">Share</span>, then{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Open your browser menu (⋮) and choose <span className="font-medium text-foreground">Install app</span> or{" "}
              <span className="font-medium text-foreground">Add to Home screen</span>.
            </p>
          )}
        </Panel>
      )}

      <Panel className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Appearance</span>
        <Segmented
          value={theme as "system" | "light" | "dark"}
          onChange={setTheme}
          options={[
            { value: "system", label: "Auto" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Panel>

      <Panel className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Data</span>
          <Segmented
            value={mode}
            onChange={(next: DataMode) => next !== mode && switchDataMode(next)}
            options={[
              { value: "real", label: "My data" },
              { value: "demo", label: "Demo" },
            ]}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "demo"
            ? "You're viewing sample data. Changes here stay in the demo and never touch your own data."
            : "Demo mode uses separate sample data, so you can explore without changing your records."}
        </p>
        {mode === "demo" && (
          <button type="button" onClick={resetDemo} className="h-9 self-start rounded-full border bg-background/40 px-4 text-xs hover:bg-accent">
            Reset demo
          </button>
        )}
      </Panel>

      <Panel className="p-2">
        <ul className="flex flex-col">
          {LINKS.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-accent/60">
                <span className="grid size-10 place-items-center rounded-full border bg-background/50">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() =>
            clearAppCacheAndReload().catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't clear the cache."))
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full border bg-card/60 text-sm hover:bg-accent"
        >
          <RefreshCw className="size-4" /> Clear cache &amp; reload
        </button>
        <p className="px-2 text-center text-xs text-muted-foreground">
          Loads the newest version of the app. Your data is kept. Stuck on an old version? Open <span className="font-medium">/reset.html</span>.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 rounded-3xl border border-expense/30 p-3">
        <button
          type="button"
          onClick={resetApp}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-destructive/10 text-sm font-medium text-expense hover:bg-destructive/20"
        >
          <Trash2 className="size-4" /> Reset app — delete everything
        </button>
        <p className="px-2 text-center text-xs text-muted-foreground">
          Removes all data (yours and the demo), your PIN, and settings, like a fresh install.
        </p>
      </div>

      {security && (
        <button type="button" onClick={lockNow} className="flex h-11 items-center justify-center gap-2 rounded-full border bg-card/60 text-sm hover:bg-accent">
          <LockKeyhole className="size-4" /> Lock now
        </button>
      )}

      <p className="flex items-start gap-2 px-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Your data stays on this device. Nothing is uploaded — export a backup to keep a copy elsewhere.
      </p>
      <p className="text-center text-[10px] text-muted-foreground/70">
        Version {pwa.version}
        {pwa.isInstalled && " · installed"}
      </p>
      {dialog}
    </main>
  );
}
