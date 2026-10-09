"use client";

import { ACCOUNT_ICONS } from "@/components/finance/category-icon";
import { useData } from "@/features/data/data-provider";
import { useBalanceVisibility } from "@/features/privacy/balance-visibility";
import { accountBalance } from "@/lib/finance/calculations";
import type { Account } from "@/lib/finance/types";
import { CURRENCIES } from "@/lib/money/currency";
import { cn } from "@/lib/utils";

/**
 * Tappable account cards (dollar accounts first, then riel) showing each balance in its own currency.
 * The amount's currency follows the chosen account. The one way to choose an account in a form.
 */
export function AccountPicker({
  value,
  onChange,
  accounts,
  exclude,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  accounts: Account[];
  exclude?: string;
  label: string;
}) {
  const { data, currencies } = useData();
  const { balance: showBalance, hidden } = useBalanceVisibility();
  const options = accounts
    .filter((a) => a.id !== exclude)
    .sort((a, b) => currencies.indexOf(a.currency) - currencies.indexOf(b.currency));
  return (
    <div role="radiogroup" aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
      {options.map((account) => {
        const Icon = ACCOUNT_ICONS[account.kind];
        const selected = account.id === value;
        const balance = accountBalance(account, data.transactions, data.goalEntries);
        return (
          <button
            key={account.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(account.id)}
            className={cn(
              "flex min-w-32 shrink-0 flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-colors",
              selected ? "border-ring bg-primary/20 ring-1 ring-ring" : "bg-background/40 hover:bg-accent",
            )}
          >
            <span className="flex w-full items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{account.name}</span>
              <span className="ml-auto rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {CURRENCIES[account.currency].symbol}
              </span>
            </span>
            <span className={cn("text-sm font-medium tabular-nums", balance < 0 && !hidden && "text-expense")}>
              {showBalance(balance, account.currency)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
