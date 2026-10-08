"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AmountInput, Field, FormDrawer, useConfirm } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { ACCOUNT_ICONS } from "@/components/finance/category-icon";
import { InfoRow, Panel } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useData } from "@/features/data/data-provider";
import { accountsRepo, transactionsRepo } from "@/lib/db/repositories";
import { accountBalance } from "@/lib/finance/calculations";
import { toLocalDate, toLocalTime } from "@/lib/finance/dates";
import type { Account, AccountKind } from "@/lib/finance/types";
import { formatMoney, parseAmount, sumMinor, toInputString } from "@/lib/money/money";
import { cn } from "@/lib/utils";

const KINDS: { value: AccountKind; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "E-wallet" },
  { value: "credit", label: "Credit card" },
];

export default function AccountsPage() {
  const { data } = useData();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const { currency } = data.settings;

  const rows = useMemo(
    () => data.accounts.map((a) => ({ account: a, balance: accountBalance(a, data.transactions, data.goalEntries) })),
    [data.accounts, data.transactions, data.goalEntries],
  );
  const total = sumMinor(rows.filter((r) => !r.account.archived && r.account.currency === currency).map((r) => r.balance));

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader
        title="Accounts"
        back
        className="px-0"
        action={
          <button type="button" aria-label="Add account" onClick={() => setEditing("new")} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </button>
        }
      />

      <Panel>
        <p className="text-sm text-foreground/90">Total across accounts</p>
        <p className="text-3xl font-semibold tabular-nums">{formatMoney(total, currency)}</p>
        <InfoRow className="mt-2">Money in savings goals is shown on the Savings goals screen.</InfoRow>
      </Panel>

      <ul className="flex flex-col gap-2">
        {rows.map(({ account, balance }) => {
          const Icon = ACCOUNT_ICONS[account.kind];
          return (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => setEditing(account)}
                className={cn("surface flex w-full items-center gap-3 rounded-2xl border p-3 text-left hover:bg-accent", account.archived && "opacity-60")}
              >
                <span className="grid size-11 place-items-center rounded-full border bg-background/50">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{account.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {KINDS.find((k) => k.value === account.kind)?.label}
                    {account.archived && " · Archived"}
                  </span>
                </span>
                <span className={cn("text-sm font-medium tabular-nums", balance < 0 && "text-expense")}>{formatMoney(balance, account.currency)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <FormDrawer open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing === "new" ? "New account" : "Edit account"}>
        {editing !== null && (
          <AccountForm
            key={editing === "new" ? "new" : editing.id}
            account={editing === "new" ? null : editing}
            balance={editing === "new" ? 0 : (rows.find((r) => r.account.id === editing.id)?.balance ?? 0)}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDrawer>
    </main>
  );
}

function AccountForm({ account, balance, onDone }: { account: Account | null; balance: number; onDone: () => void }) {
  const { data, refresh } = useData();
  const { confirm, dialog } = useConfirm();
  const currency = account?.currency ?? data.settings.currency;
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "bank");
  const [opening, setOpening] = useState(account ? toInputString(account.openingBalance, currency) : "");
  const [negativeOpening, setNegativeOpening] = useState((account?.openingBalance ?? 0) < 0);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [actual, setActual] = useState("");

  const used = account
    ? data.transactions.some((t) =>
        t.type === "transfer" ? t.fromAccountId === account.id || t.toAccountId === account.id : t.accountId === account.id,
      ) || data.goalEntries.some((e) => e.accountId === account.id)
    : false;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the account a name.");
    const openingValue = opening.trim() ? parseAmount(opening.replace("-", ""), currency) : 0;
    if (openingValue === null) return toast.error("Opening balance isn't a valid amount.");
    const openingBalance = negativeOpening ? -openingValue : openingValue;

    try {
      if (account) {
        await accountsRepo.update({ ...account, name: name.trim(), kind, openingBalance, archived });
      } else {
        await accountsRepo.create({ name: name.trim(), kind, currency, openingBalance, archived: false });
      }
      await refresh();
      toast.success(account ? "Account saved" : "Account added");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  /** Reconcile with the real balance by recording an adjustment (never income/expense). */
  async function adjust() {
    if (!account) return;
    const negative = actual.trim().startsWith("-");
    const value = parseAmount(actual.replace("-", ""), currency);
    if (value === null) return toast.error("Enter the actual balance.");
    const target = negative ? -value : value;
    const delta = target - balance;
    if (delta === 0) return toast.info("Balance already matches.");
    const now = new Date();
    await transactionsRepo.create({
      type: "adjustment",
      accountId: account.id,
      delta,
      date: toLocalDate(now),
      time: toLocalTime(now),
      note: "Balance adjustment",
    });
    await refresh();
    toast.success(`Adjusted by ${formatMoney(delta, currency, { signed: true })}`);
    onDone();
  }

  async function remove() {
    if (!account) return;
    if (!(await confirm("Delete this account?", "It has no transactions, so nothing else changes."))) return;
    await accountsRepo.softDelete(account.id);
    await refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="acc-name">
        <Input id="acc-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
      </Field>
      <Field label="Type">
        <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
          <SelectTrigger className="h-11! w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Opening balance" hint="What the account held when you started tracking. Not counted as income.">
        <div className="flex items-center gap-2">
          <AmountInput value={opening} onChange={setOpening} currency={currency} className="flex-1" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={negativeOpening} onCheckedChange={setNegativeOpening} /> Owed
          </label>
        </div>
      </Field>
      {account && (
        <label className="flex items-center justify-between rounded-xl border bg-background/40 px-3 py-2.5 text-sm">
          <span>
            Archived
            <span className="block text-xs text-muted-foreground">Hidden from pickers; history is kept</span>
          </span>
          <Switch checked={archived} onCheckedChange={setArchived} />
        </label>
      )}
      <Button type="submit" className="h-12 rounded-full text-base">
        {account ? "Save" : "Add account"}
      </Button>

      {account && (
        <div className="mt-2 flex flex-col gap-3 rounded-2xl border p-3">
          <p className="text-sm font-medium">Adjust balance</p>
          <p className="text-xs text-muted-foreground">
            Current: {formatMoney(balance, currency)}. Enter what the account really holds; the difference is recorded as an
            adjustment, not as income or spending.
          </p>
          <div className="flex gap-2">
            <AmountInput value={actual} onChange={setActual} currency={currency} className="flex-1" placeholder="Actual balance" />
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={adjust}>
              Adjust
            </Button>
          </div>
        </div>
      )}
      {account && !used && (
        <Button type="button" variant="ghost" className="h-11 rounded-full text-expense" onClick={remove}>
          Delete account
        </Button>
      )}
      {account && used && <InfoRow>Accounts with history can be archived instead of deleted.</InfoRow>}
      {dialog}
    </form>
  );
}
