"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { AmountInput, Field, FormDrawer, useConfirm } from "@/components/app/form";
import { CategoryIcon, paletteColor } from "@/components/finance/category-icon";
import { Segmented } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useData } from "@/features/data/data-provider";
import { deleteTransaction, saveTransfer, transactionsRepo } from "@/lib/db/repositories";
import { FEES_CATEGORY_ID } from "@/lib/db/seed";
import { toLocalDate, toLocalTime } from "@/lib/finance/dates";
import type { ExpenseTransaction, Transaction } from "@/lib/finance/types";
import type { CurrencyCode } from "@/lib/money/currency";
import { formatMoney, parseAmount, toInputString } from "@/lib/money/money";
import { cn } from "@/lib/utils";

type FormType = "expense" | "income" | "transfer";

interface SheetContextValue {
  /** Open the drawer to add a new transaction, or to edit an existing one. */
  openTransaction: (options?: { type?: FormType; edit?: Transaction; date?: string }) => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function useTransactionSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useTransactionSheet must be used inside <TransactionSheetProvider>");
  return ctx;
}

interface FormState {
  type: FormType;
  amount: string;
  accountId: string;
  categoryId: string;
  isRefund: boolean;
  fromAccountId: string;
  toAccountId: string;
  toAmount: string;
  fee: string;
  date: string;
  time: string;
  note: string;
}

export function TransactionSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [initialType, setInitialType] = useState<FormType>("expense");
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [formKey, setFormKey] = useState(0);

  const openTransaction = useCallback<SheetContextValue["openTransaction"]>((options) => {
    setEditing(options?.edit ?? null);
    setInitialType(options?.type ?? "expense");
    setInitialDate(options?.date);
    setFormKey((k) => k + 1);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openTransaction }), [openTransaction]);

  const title = editing
    ? editing.type === "adjustment"
      ? "Balance adjustment"
      : "Edit transaction"
    : "New transaction";

  return (
    <SheetContext.Provider value={value}>
      {children}
      <FormDrawer open={open} onOpenChange={setOpen} title={title}>
        {open && <TransactionForm key={formKey} editing={editing} initialType={initialType} initialDate={initialDate} onDone={() => setOpen(false)} />}
      </FormDrawer>
    </SheetContext.Provider>
  );
}

function TransactionForm({
  editing,
  initialType,
  initialDate,
  onDone,
}: {
  editing: Transaction | null;
  initialType: FormType;
  initialDate?: string;
  onDone: () => void;
}) {
  const { data, refresh, accountById } = useData();
  const { confirm, dialog } = useConfirm();
  const [saving, setSaving] = useState(false);

  const activeAccounts = data.accounts.filter((a) => !a.archived || isUsedBy(editing, a.id));
  const existingFee =
    editing?.type === "transfer"
      ? (data.transactions.find((t) => t.type === "expense" && t.transferId === editing.id) as ExpenseTransaction | undefined)
      : undefined;

  const currencyOf = (id: string) => accountById.get(id)?.currency ?? data.settings.currency;
  const [form, setForm] = useState<FormState>(() =>
    initialState(editing, initialType, activeAccounts[0]?.id ?? "", existingFee, currencyOf, initialDate),
  );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  if (editing?.type === "adjustment") {
    const account = accountById.get(editing.accountId);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Correction of {formatMoney(editing.delta, account?.currency ?? data.settings.currency, { signed: true })} on {account?.name ?? "a deleted account"},
          made on {editing.date}. Adjustments change the balance but never count as income or spending.
        </p>
        <Button variant="destructive" className="h-11 rounded-xl" onClick={() => remove(editing)}>
          Delete adjustment
        </Button>
        {dialog}
      </div>
    );
  }

  const accountCurrency = currencyOf(form.type === "transfer" ? form.fromAccountId : form.accountId);
  const crossCurrency = form.type === "transfer" && currencyOf(form.fromAccountId) !== currencyOf(form.toAccountId);
  const categories = data.categories.filter((c) => c.kind === (form.type === "income" ? "income" : "expense"));

  async function remove(t: Transaction) {
    const ok = await confirm(
      "Delete this transaction?",
      t.type === "transfer" ? "The transfer and its fee (if any) will be removed." : "Balances, budgets, and reports will update.",
    );
    if (!ok) return;
    await deleteTransaction(t, data.transactions);
    await refresh();
    toast.success("Transaction deleted");
    onDone();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(form.amount, accountCurrency);
    if (!amount || amount <= 0) return toast.error("Enter an amount greater than zero.");
    if (!form.date) return toast.error("Pick a date.");

    const base = { date: form.date, time: form.time || undefined, note: form.note.trim() || undefined };
    setSaving(true);
    try {
      if (form.type === "transfer") {
        if (!form.fromAccountId || !form.toAccountId) return toast.error("Choose both accounts.");
        if (form.fromAccountId === form.toAccountId) return toast.error("Pick two different accounts.");
        const toAmount = crossCurrency ? parseAmount(form.toAmount, currencyOf(form.toAccountId)) : amount;
        if (!toAmount || toAmount <= 0) return toast.error("Enter the amount that arrived.");
        const fee = form.fee.trim() ? parseAmount(form.fee, accountCurrency) : null;
        if (form.fee.trim() && (!fee || fee <= 0)) return toast.error("Fee must be greater than zero.");

        const transferFields = {
          ...base,
          type: "transfer" as const,
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          fromAmount: amount,
          toAmount,
        };
        const feeCategoryId = data.categories.some((c) => c.id === FEES_CATEGORY_ID) ? FEES_CATEGORY_ID : categories[0]?.id;
        if (fee && !feeCategoryId) return toast.error("Add an expense category for the fee first.");
        const feeRecord =
          fee && feeCategoryId
            ? { ...base, type: "expense" as const, accountId: form.fromAccountId, categoryId: feeCategoryId, amount: fee, note: "Transfer fee" }
            : null;

        if (editing?.type === "transfer") {
          await saveTransfer({ ...editing, ...transferFields }, feeRecord, existingFee);
        } else {
          if (editing) await deleteTransaction(editing, data.transactions);
          await saveTransfer(transferFields, feeRecord);
        }
      } else {
        if (!form.accountId) return toast.error("Choose an account.");
        if (!form.categoryId) return toast.error("Choose a category.");
        const record =
          form.type === "income"
            ? { ...base, type: "income" as const, accountId: form.accountId, categoryId: form.categoryId, amount }
            : {
                ...base,
                type: "expense" as const,
                accountId: form.accountId,
                categoryId: form.categoryId,
                amount,
                isRefund: form.isRefund || undefined,
                transferId: editing?.type === "expense" ? editing.transferId : undefined,
              };

        if (editing && editing.type === form.type) {
          await transactionsRepo.update({ ...editing, ...record } as Transaction);
        } else {
          // Type changed (e.g. transfer → expense): replace the record so no stale fields remain.
          if (editing) await deleteTransaction(editing, data.transactions);
          await transactionsRepo.create(record);
        }
      }
      await refresh();
      toast.success(editing ? "Saved" : "Transaction added");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Segmented
        value={form.type}
        onChange={(type) => setForm((f) => ({ ...f, type, categoryId: "" }))}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
          { value: "transfer", label: "Transfer" },
        ]}
        className="justify-center"
      />

      <AmountInput large autoFocus={!editing} value={form.amount} onChange={(v) => set("amount", v)} currency={accountCurrency} aria-label="Amount" />

      {form.type === "transfer" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <AccountSelect value={form.fromAccountId} onChange={(v) => set("fromAccountId", v)} accounts={activeAccounts} />
            </Field>
            <Field label="To">
              <AccountSelect value={form.toAccountId} onChange={(v) => set("toAccountId", v)} accounts={activeAccounts} />
            </Field>
          </div>
          {crossCurrency && (
            <Field label="Amount received" hint="Different currencies: enter what actually arrived.">
              <AmountInput value={form.toAmount} onChange={(v) => set("toAmount", v)} currency={currencyOf(form.toAccountId)} />
            </Field>
          )}
          <Field label="Fee (optional)" hint="Counted as a spending in Fees. The transferred amount is not spending.">
            <AmountInput value={form.fee} onChange={(v) => set("fee", v)} currency={accountCurrency} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Account">
            <AccountSelect value={form.accountId} onChange={(v) => set("accountId", v)} accounts={activeAccounts} />
          </Field>
          <Field label="Category">
            <div className="grid grid-cols-4 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set("categoryId", c.id)}
                  aria-pressed={form.categoryId === c.id}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border p-2 text-[11px] transition-colors",
                    form.categoryId === c.id ? "border-ring bg-primary/25" : "bg-background/40 hover:bg-accent",
                  )}
                >
                  <span className="grid size-8 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${paletteColor(c.color)} 22%, transparent)`, color: paletteColor(c.color) }}>
                    <CategoryIcon name={c.icon} className="size-4" />
                  </span>
                  <span className="w-full truncate text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </Field>
          {form.type === "expense" && (
            <label className="flex items-center justify-between rounded-xl border bg-background/40 px-3 py-2.5 text-sm">
              <span>
                Refund
                <span className="block text-xs text-muted-foreground">Money back — reduces spending in this category</span>
              </span>
              <Switch checked={form.isRefund} onCheckedChange={(v) => set("isRefund", v)} />
            </label>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="tx-date">
          <Input id="tx-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="Time" htmlFor="tx-time">
          <Input id="tx-time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>

      <Field label="Note" htmlFor="tx-note">
        <Input id="tx-note" value={form.note} maxLength={120} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Withdraw from ATM" className="h-11 rounded-xl" />
      </Field>

      <Button type="submit" disabled={saving} className="h-12 rounded-full text-base">
        {editing ? "Save changes" : "Add transaction"}
      </Button>
      {editing && (
        <Button type="button" variant="ghost" className="h-11 rounded-full text-expense" onClick={() => remove(editing)}>
          Delete
        </Button>
      )}
      {dialog}
    </form>
  );
}

function AccountSelect({
  value,
  onChange,
  accounts,
}: {
  value: string;
  onChange: (id: string) => void;
  accounts: { id: string; name: string }[];
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
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
  );
}

function isUsedBy(t: Transaction | null, accountId: string): boolean {
  if (!t) return false;
  return t.type === "transfer" ? t.fromAccountId === accountId || t.toAccountId === accountId : t.accountId === accountId;
}

function initialState(
  editing: Transaction | null,
  type: FormType,
  defaultAccountId: string,
  fee: ExpenseTransaction | undefined,
  currencyOf: (accountId: string) => CurrencyCode,
  date?: string,
): FormState {
  const now = new Date();
  const base: FormState = {
    type,
    amount: "",
    accountId: defaultAccountId,
    categoryId: "",
    isRefund: false,
    fromAccountId: defaultAccountId,
    toAccountId: "",
    toAmount: "",
    fee: "",
    date: date ?? toLocalDate(now),
    time: toLocalTime(now),
    note: "",
  };
  if (!editing || editing.type === "adjustment") return base;

  const common = { ...base, date: editing.date, time: editing.time ?? "", note: editing.note ?? "" };
  if (editing.type === "transfer") {
    const from = currencyOf(editing.fromAccountId);
    return {
      ...common,
      type: "transfer",
      amount: toInputString(editing.fromAmount, from),
      toAmount: toInputString(editing.toAmount, currencyOf(editing.toAccountId)),
      fromAccountId: editing.fromAccountId,
      toAccountId: editing.toAccountId,
      fee: fee ? toInputString(fee.amount, from) : "",
    };
  }
  return {
    ...common,
    type: editing.type,
    amount: toInputString(editing.amount, currencyOf(editing.accountId)),
    accountId: editing.accountId,
    categoryId: editing.categoryId,
    isRefund: editing.type === "expense" && !!editing.isRefund,
  };
}
