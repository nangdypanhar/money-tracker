"use client";

import { PiggyBank, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AmountInput, Field, FormDrawer, useConfirm } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { EmptyState, InfoRow, Panel, Segmented } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/features/data/data-provider";
import { goalEntriesRepo, goalsRepo } from "@/lib/db/repositories";
import { accountBalance, goalBalance, goalProgress } from "@/lib/finance/calculations";
import { parseLocalDate, toLocalDate } from "@/lib/finance/dates";
import type { Goal } from "@/lib/finance/types";
import { formatMoney, parseAmount, sumMinor, toInputString } from "@/lib/money/money";

export default function GoalsPage() {
  const { data } = useData();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [moving, setMoving] = useState<Goal | null>(null);
  const { currency } = data.settings;
  const totalSaved = sumMinor(data.goals.filter((g) => g.currency === currency).map((g) => goalBalance(g, data.goalEntries)));

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader
        title="Savings goals"
        back
        className="px-0"
        action={
          <button type="button" aria-label="Add goal" onClick={() => setEditing("new")} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </button>
        }
      />

      <Panel>
        <p className="text-sm text-foreground/90">Total saved</p>
        <p className="text-3xl font-semibold tabular-nums">{formatMoney(totalSaved, currency)}</p>
        <InfoRow className="mt-2">Saving moves money out of an account into a goal. It isn&apos;t spending.</InfoRow>
      </Panel>

      {data.goals.length === 0 ? (
        <EmptyState title="No savings goals yet">Create one to start setting money aside.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.goals.map((goal) => {
            const saved = goalBalance(goal, data.goalEntries);
            const progress = goalProgress(goal, data.goalEntries) ?? 0;
            return (
              <li key={goal.id} className="surface flex flex-col gap-3 rounded-3xl border p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 place-items-center rounded-full border bg-background/50">
                    <PiggyBank className="size-5" />
                  </span>
                  <button type="button" onClick={() => setEditing(goal)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{goal.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatMoney(saved, goal.currency)} of {formatMoney(goal.targetAmount, goal.currency)}
                      {goal.targetDate && ` · by ${parseLocalDate(goal.targetDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                    </span>
                  </button>
                  <span className="text-sm font-medium tabular-nums">{Math.floor(progress * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-2" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                </div>
                <Button variant="outline" className="h-10 rounded-full" onClick={() => setMoving(goal)}>
                  Add or withdraw money
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <FormDrawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "New goal" : "Edit goal"}>
        {editing !== null && <GoalForm key={editing === "new" ? "new" : editing.id} goal={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </FormDrawer>
      <FormDrawer open={moving !== null} onOpenChange={(o) => !o && setMoving(null)} title={moving?.name ?? "Goal"}>
        {moving && <MoveMoneyForm key={moving.id} goal={moving} onDone={() => setMoving(null)} />}
      </FormDrawer>
    </main>
  );
}

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const { data, refresh } = useData();
  const { confirm, dialog } = useConfirm();
  const currency = goal?.currency ?? data.settings.currency;
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? toInputString(goal.targetAmount, currency) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const saved = goal ? goalBalance(goal, data.goalEntries) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const targetAmount = parseAmount(target, currency);
    if (!name.trim()) return toast.error("Name the goal.");
    if (!targetAmount || targetAmount <= 0) return toast.error("Enter a target amount.");
    const fields = { name: name.trim(), targetAmount, targetDate: targetDate || undefined };
    if (goal) await goalsRepo.update({ ...goal, ...fields });
    else await goalsRepo.create({ ...fields, currency, archived: false });
    await refresh();
    onDone();
  }

  async function remove() {
    if (!goal) return;
    if (!(await confirm("Delete this goal?", "The goal is empty, so no balances change."))) return;
    // Entries are kept on purpose: money may have gone in from one account and out to another,
    // and removing those entries would change account balances.
    await goalsRepo.softDelete(goal.id);
    await refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="goal-name">
        <Input id="goal-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" className="h-11 rounded-xl" />
      </Field>
      <Field label="Target">
        <AmountInput value={target} onChange={setTarget} currency={currency} />
      </Field>
      <Field label="Target date (optional)" htmlFor="goal-date">
        <Input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-11 rounded-xl" />
      </Field>
      <Button type="submit" className="h-12 rounded-full text-base">
        {goal ? "Save" : "Create goal"}
      </Button>
      {goal &&
        (saved === 0 ? (
          <Button type="button" variant="ghost" className="h-11 rounded-full text-expense" onClick={remove}>
            Delete goal
          </Button>
        ) : (
          <InfoRow>Withdraw the {formatMoney(saved, currency)} saved before deleting this goal.</InfoRow>
        ))}
      {dialog}
    </form>
  );
}

function MoveMoneyForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const { data, refresh } = useData();
  const accounts = data.accounts.filter((a) => !a.archived && a.currency === goal.currency);
  const [kind, setKind] = useState<"contribution" | "withdrawal">("contribution");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toLocalDate(new Date()));
  const saved = goalBalance(goal, data.goalEntries);
  const account = data.accounts.find((a) => a.id === accountId);
  const available = account ? accountBalance(account, data.transactions, data.goalEntries) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount, goal.currency);
    if (!value || value <= 0) return toast.error("Enter an amount greater than zero.");
    if (!accountId) return toast.error("Choose an account.");
    if (kind === "withdrawal" && value > saved) return toast.error(`Only ${formatMoney(saved, goal.currency)} is saved in this goal.`);
    await goalEntriesRepo.create({ goalId: goal.id, accountId, kind, amount: value, date });
    await refresh();
    toast.success(kind === "contribution" ? "Added to goal" : "Withdrawn from goal");
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "contribution", label: "Add money" },
          { value: "withdrawal", label: "Withdraw" },
        ]}
        className="justify-center"
      />
      <AmountInput large value={amount} onChange={setAmount} currency={goal.currency} aria-label="Amount" />
      <Field
        label={kind === "contribution" ? "From account" : "To account"}
        hint={account ? `${account.name} balance: ${formatMoney(available, goal.currency)}` : undefined}
      >
        <Select value={accountId || undefined} onValueChange={setAccountId}>
          <SelectTrigger className="h-11! w-full rounded-xl">
            <SelectValue placeholder="Choose account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Date" htmlFor="goal-entry-date">
        <Input id="goal-entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
      </Field>
      <InfoRow>
        {kind === "contribution"
          ? "Moves money from the account into this goal — not counted as spending."
          : `Moves money back to the account — not counted as income. Saved: ${formatMoney(saved, goal.currency)}.`}
      </InfoRow>
      <Button type="submit" className="h-12 rounded-full text-base">
        {kind === "contribution" ? "Add to goal" : "Withdraw"}
      </Button>
    </form>
  );
}
