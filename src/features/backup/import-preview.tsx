"use client";

import { CircleCheck, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { InfoRow } from "@/components/finance/primitives";
import { TransactionList, TransactionLookupProvider } from "@/components/finance/transaction-list";
import { Button } from "@/components/ui/button";
import type { ImportPreview } from "@/lib/backup/backup";
import { countChanges, type DataChanges, MERGED_STORES, type MergedStore } from "@/lib/backup/merge";
import { formatDate, formatTime12, toLocalDate, toLocalTime } from "@/lib/finance/dates";
import type { Account, Category, Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export type ImportMode = "merge" | "replace";

const STORE_LABEL: Record<MergedStore, string> = {
  transactions: "Transactions",
  accounts: "Accounts",
  categories: "Categories",
  budgets: "Budgets",
  goals: "Savings goals",
  goalEntries: "Goal deposits & withdrawals",
  shoppingItems: "Shopping items",
  shoppingLists: "Shopping lists",
};

const MAX_ROWS = 20;

/** "Tue, 13 Oct 2026, 10:40 AM" for a backup's ISO timestamp. */
export function backupDate(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(toLocalDate(d))}, ${formatTime12(toLocalTime(d))}`;
}

/** Toast text after applying a merge: "Added 3 · changed 1". */
export function changesMessage({ added, updated, removed }: { added: number; updated: number; removed: number }): string {
  const parts = [added && `added ${added}`, updated && `changed ${updated}`, removed && `removed ${removed}`].filter(Boolean);
  if (parts.length === 0) return "Already up to date";
  const text = parts.join(" · ");
  return text[0].toUpperCase() + text.slice(1);
}

const newestFirst = (a: Transaction, b: Transaction) =>
  b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "") || b.createdAt.localeCompare(a.createdAt);

function recordName(record: unknown): string | null {
  const r = record as { name?: unknown; note?: unknown };
  return typeof r.name === "string" && r.name ? r.name : typeof r.note === "string" && r.note ? r.note : null;
}

/** "+3 new · 1 changed · 2 removed" for one kind of record. */
function ChangeSummary({ changes }: { changes: DataChanges }) {
  const rows = MERGED_STORES.filter((s) => changes[s].added.length + changes[s].updated.length + changes[s].removed.length > 0);
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border">
      {rows.map((store) => {
        const c = changes[store];
        const names =
          store === "transactions" || store === "goalEntries"
            ? []
            : [...c.added, ...c.updated.map((u) => u.after)].map(recordName).filter((n): n is string => !!n);
        return (
          <li key={store} className="flex flex-col gap-1 px-4 py-2.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{STORE_LABEL[store]}</span>
              <span className="flex flex-wrap justify-end gap-1.5 text-xs">
                {c.added.length > 0 && <Pill className="border-primary/40 text-primary">+{c.added.length} new</Pill>}
                {c.updated.length > 0 && <Pill>{c.updated.length} changed</Pill>}
                {c.removed.length > 0 && <Pill className="text-muted-foreground">{c.removed.length} removed</Pill>}
              </span>
            </div>
            {names.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">
                {names.slice(0, 4).join(", ")}
                {names.length > 4 && ` +${names.length - 4} more`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full border px-2 py-0.5 tabular-nums", className)}>{children}</span>;
}

function TransactionSection({ title, transactions }: { title: string; transactions: Transaction[] }) {
  if (transactions.length === 0) return null;
  const shown = [...transactions].sort(newestFirst).slice(0, MAX_ROWS);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-sm font-medium">{title}</h3>
      <TransactionList transactions={shown} />
      {transactions.length > shown.length && (
        <p className="px-1 text-xs text-muted-foreground">and {transactions.length - shown.length} more</p>
      )}
    </section>
  );
}

/**
 * What importing a backup would change on this device, before anything is written. The main action adds the
 * listed changes (a merge); "Replace everything" is secondary and shows what it would remove first.
 */
export function ImportPreviewBody({
  preview,
  sourceLabel,
  busy,
  onApply,
  onExport,
  onCancel,
}: {
  preview: ImportPreview;
  /** e.g. "Backup from Tue, 13 Oct 2026, 10:40 AM" */
  sourceLabel: string;
  busy: boolean;
  onApply: (mode: ImportMode) => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>("merge");
  const changes = mode === "merge" ? preview.merge : preview.replace;
  const counts = countChanges(changes);
  const nothing = counts.added + counts.updated + counts.removed === 0;
  const lookup = useMemo(
    () => ({
      // The backup's names first, then this device's (both are listed; first match wins).
      accountById: new Map<string, Account>([...preview.lookup.accounts].reverse().map((a) => [a.id, a])),
      categoryById: new Map<string, Category>([...preview.lookup.categories].reverse().map((c) => [c.id, c])),
    }),
    [preview],
  );
  const tx = changes.transactions;

  if (mode === "merge" && nothing) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CircleCheck className="size-10 text-primary" />
        <p className="font-medium">Already up to date</p>
        <p className="text-sm text-muted-foreground">
          {sourceLabel}. Everything in it is already on this device — there&apos;s nothing to add.
        </p>
        <Button onClick={onCancel} className="h-11 w-full rounded-full">
          Done
        </Button>
        <button type="button" onClick={() => setMode("replace")} className="min-h-11 text-xs text-muted-foreground underline underline-offset-4">
          Replace everything instead…
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {sourceLabel}.{" "}
        {mode === "merge"
          ? "Here's what it adds or changes on this device. Nothing on this device is lost."
          : "Replacing makes this device match the backup exactly:"}
      </p>
      {nothing ? (
        <InfoRow>This device already matches the backup exactly.</InfoRow>
      ) : (
        <ChangeSummary changes={changes} />
      )}

      <TransactionLookupProvider value={lookup}>
        <TransactionSection title={mode === "merge" ? "New transactions" : "Transactions added"} transactions={tx.added} />
        <TransactionSection title="Changed transactions" transactions={tx.updated.map((u) => u.after)} />
        <TransactionSection
          title={mode === "merge" ? "Transactions deleted on the other device" : "Transactions removed from this device"}
          transactions={tx.removed}
        />
      </TransactionLookupProvider>

      <Button variant="outline" onClick={onExport} disabled={busy} className="h-11 rounded-full">
        <Download /> Download this device&apos;s data first
      </Button>
      {mode === "merge" ? (
        <>
          <Button onClick={() => onApply("merge")} disabled={busy} className="h-11 rounded-full">
            {busy ? "Adding…" : "Add these changes"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy} className="h-11 rounded-full">
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => setMode("replace")}
            disabled={busy}
            className="min-h-11 text-xs text-muted-foreground underline underline-offset-4"
          >
            Replace everything instead…
          </button>
        </>
      ) : (
        <>
          <Button variant="destructive" onClick={() => onApply("replace")} disabled={busy || nothing} className="h-11 rounded-full">
            {busy ? "Replacing…" : "Replace everything"}
          </Button>
          <Button variant="outline" onClick={() => setMode("merge")} disabled={busy} className="h-11 rounded-full">
            Back
          </Button>
        </>
      )}
    </div>
  );
}
