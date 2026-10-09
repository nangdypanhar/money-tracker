"use client";

import { Check, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AmountInput, Field, FormDrawer, useConfirm } from "@/components/app/form";
import { DateField } from "@/components/app/date-field";
import { ScreenHeader } from "@/components/app/screen-header";
import { paletteColor } from "@/components/finance/category-icon";
import { CurrencyTag, EmptyState, InfoRow, Panel, Segmented } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData } from "@/features/data/data-provider";
import { useTransactionSheet } from "@/features/transactions/transaction-sheet";
import { deleteShoppingItems, deleteShoppingList, shoppingItemsRepo, shoppingListsRepo } from "@/lib/db/repositories";
import { formatDate, toLocalDate } from "@/lib/finance/dates";
import {
  estimateTotals,
  groupShoppingItems,
  isOverdue,
  type ShoppingGroup,
  type ShoppingGrouping,
  shoppingSummary,
} from "@/lib/finance/shopping";
import type { ShoppingItem, ShoppingList, ShoppingPriority } from "@/lib/finance/types";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/money/currency";
import { formatMoney, parseAmount, toInputString } from "@/lib/money/money";
import { cn } from "@/lib/utils";

const PRIORITIES: { value: ShoppingPriority; label: string }[] = [
  { value: "need", label: "Need" },
  { value: "want", label: "Want" },
];

const GROUPINGS: { value: ShoppingGrouping; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "list", label: "List" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/** UI preference, remembered on this device. */
const GROUPING_KEY = "moneytrack:shopping-group";
const ALL = "all";

function readGrouping(): ShoppingGrouping {
  if (typeof window === "undefined") return "priority";
  try {
    const saved = localStorage.getItem(GROUPING_KEY);
    return GROUPINGS.some((g) => g.value === saved) ? (saved as ShoppingGrouping) : "priority";
  } catch {
    return "priority";
  }
}

export default function ShoppingPage() {
  const { data, currencies, refresh } = useData();
  const { openTransaction } = useTransactionSheet();
  const { confirm, dialog } = useConfirm();
  const [view, setView] = useState<"open" | "bought">("open");
  const [listFilter, setListFilter] = useState<string>(ALL);
  const [chosenGrouping, setChosenGrouping] = useState<ShoppingGrouping>(readGrouping);
  const [editing, setEditing] = useState<ShoppingItem | "new" | null>(null);
  const [editingList, setEditingList] = useState<ShoppingList | "new" | null>(null);

  const lists = data.shoppingLists;
  const activeList = lists.find((l) => l.id === listFilter) ?? null;
  // A deleted list may still be selected; fall back to all items.
  const filter = activeList ? activeList.id : ALL;
  const items = filter === ALL ? data.shoppingItems : data.shoppingItems.filter((i) => i.listId === filter);
  const open = items.filter((i) => !i.boughtAt);
  const bought = items.filter((i) => i.boughtAt);
  const today = toLocalDate(new Date());

  // Grouping by list means nothing inside a single list.
  const grouping = chosenGrouping === "list" && activeList ? "priority" : chosenGrouping;
  const groups = groupShoppingItems(view === "open" ? open : bought, grouping, today, lists, { newestFirst: view === "bought" });
  const listById = new Map(lists.map((l) => [l.id, l]));

  function chooseGrouping(next: ShoppingGrouping) {
    setChosenGrouping(next);
    try {
      localStorage.setItem(GROUPING_KEY, next);
    } catch {
      // Storage blocked: the choice still applies until reload.
    }
  }

  async function toggleBought(item: ShoppingItem) {
    if (item.boughtAt) {
      await shoppingItemsRepo.update({ ...item, boughtAt: undefined });
      await refresh();
      return;
    }
    await shoppingItemsRepo.update({ ...item, boughtAt: new Date().toISOString() });
    await refresh();
    // Ticking an item off doesn't move money; offer to record the purchase as a normal expense.
    toast.success(`Bought: ${item.name}`, {
      action: {
        label: "Record expense",
        onClick: () =>
          openTransaction({ type: "expense", prefill: { currency: item.currency, amount: item.estimate, note: item.name } }),
      },
    });
  }

  async function clearBought() {
    if (!(await confirm("Clear bought items?", `${bought.length} bought item(s) will be removed from the list. Recorded expenses aren't touched.`, "Clear"))) return;
    await deleteShoppingItems(bought);
    await refresh();
  }

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader
        title="Shopping list"
        back
        className="px-0"
        action={
          <button type="button" aria-label="Add item" onClick={() => setEditing("new")} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </button>
        }
      />

      <div role="tablist" aria-label="Lists" className="scrollbar-none -mx-4 -my-3 flex gap-2 overflow-x-auto px-4 py-3">
        <ListChip label="All" count={data.shoppingItems.filter((i) => !i.boughtAt).length} selected={filter === ALL} onClick={() => setListFilter(ALL)} />
        {lists.map((list) => (
          <ListChip
            key={list.id}
            label={list.name}
            color={list.color}
            count={data.shoppingItems.filter((i) => i.listId === list.id && !i.boughtAt).length}
            selected={filter === list.id}
            // Tapping the selected list again opens its settings.
            onClick={() => (filter === list.id ? setEditingList(list) : setListFilter(list.id))}
          />
        ))}
        <button
          type="button"
          onClick={() => setEditingList("new")}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:bg-accent"
        >
          <Plus className="size-3.5" /> List
        </button>
      </div>

      <Panel className="flex flex-col gap-3">
        <div className="-my-3 -mr-3 flex items-center justify-between">
          <p className="flex min-w-0 items-center gap-2 text-sm text-foreground/90">
            {activeList && <span className="size-2 shrink-0 rounded-full" style={{ background: paletteColor(activeList.color) }} />}
            <span className="truncate">{activeList ? `${activeList.name} · still to buy` : "Still to buy"}</span>
          </p>
          {activeList ? (
            <button
              type="button"
              aria-label={`Edit ${activeList.name}`}
              onClick={() => setEditingList(activeList)}
              className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="size-4" />
            </button>
          ) : (
            <span className="h-11" />
          )}
        </div>
        <div className="flex flex-col divide-y divide-border">
          {currencies.map((code) => {
            const summary = shoppingSummary(items, code);
            return (
              <div key={code} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                <CurrencyTag currency={code} />
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(summary.needEstimate, code)}</p>
                <p className="text-xs text-muted-foreground">
                  needed{summary.wantEstimate > 0 && ` · ${formatMoney(summary.wantEstimate, code)} more for wants`}
                </p>
              </div>
            );
          })}
        </div>
        <InfoRow>A plan only — your balance changes when you record the purchase as an expense.</InfoRow>
      </Panel>

      <div className="flex flex-col gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: `To buy${open.length ? ` (${open.length})` : ""}` },
            { value: "bought", label: `Bought${bought.length ? ` (${bought.length})` : ""}` },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">Group by</span>
          <div role="tablist" aria-label="Group by" className="scrollbar-none -my-1 -mr-4 -ml-1 flex gap-1.5 overflow-x-auto py-1 pr-4 pl-1">
            {GROUPINGS.filter((g) => g.value !== "list" || !activeList).map((g) => (
              <button
                key={g.value}
                type="button"
                role="tab"
                aria-selected={grouping === g.value}
                onClick={() => chooseGrouping(g.value)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3 text-xs transition-colors",
                  grouping === g.value ? "border-ring/60 bg-primary/20 text-foreground ring-1 ring-ring" : "bg-card/40 text-muted-foreground hover:bg-accent",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        view === "open" ? (
          <EmptyState title={activeList ? `Nothing to buy in ${activeList.name}` : "Nothing to buy"}>
            Add things you need or want to buy, with an expected price if you know it.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing bought yet">Tick an item off when you buy it.</EmptyState>
        )
      ) : (
        groups.map((group) => (
          <GroupSection
            key={group.key}
            group={group}
            today={today}
            // Show each item's list when the groups don't already say it.
            listById={filter === ALL && grouping !== "list" ? listById : null}
            showDate={grouping !== "day" || !!group.overdue}
            onToggle={toggleBought}
            onEdit={setEditing}
          />
        ))
      )}

      {view === "bought" && bought.length > 0 && (
        <Button variant="outline" className="h-11 rounded-full" onClick={clearBought}>
          Clear bought items
        </Button>
      )}

      <FormDrawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "New item" : "Edit item"}>
        {editing !== null && (
          <ItemForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? null : editing}
            defaultListId={activeList?.id}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDrawer>
      <FormDrawer open={editingList !== null} onOpenChange={(o) => !o && setEditingList(null)} title={editingList === "new" ? "New list" : "Edit list"}>
        {editingList !== null && (
          <ListForm
            key={editingList === "new" ? "new" : editingList.id}
            list={editingList === "new" ? null : editingList}
            onDone={(saved) => {
              setEditingList(null);
              setListFilter(saved?.id ?? ALL);
            }}
          />
        )}
      </FormDrawer>
      {dialog}
    </main>
  );
}

function ListChip({ label, color, count, selected, onClick }: { label: string; color?: number; count: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        selected ? "border-ring/60 bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--primary)]" : "bg-card/40 hover:bg-accent",
      )}
    >
      {color !== undefined && <span className="size-2 rounded-full" style={{ background: paletteColor(color) }} />}
      {label}
      {count > 0 && <span className={cn("text-xs tabular-nums", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>}
    </button>
  );
}

function GroupSection({
  group,
  today,
  listById,
  showDate,
  onToggle,
  onEdit,
}: {
  group: ShoppingGroup;
  today: string;
  listById: Map<string, ShoppingList> | null;
  showDate: boolean;
  onToggle: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem) => void;
}) {
  const totals = estimateTotals(group.items);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className={cn("flex min-w-0 items-center gap-2 text-sm font-medium", group.overdue && "text-primary")}>
          {group.list && <span className="size-2 shrink-0 rounded-full" style={{ background: paletteColor(group.list.color) }} />}
          <span className="truncate">{group.label}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{group.items.length}</span>
        </h2>
        {totals.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {totals.map((t) => formatMoney(t.total, t.currency)).join(" · ")}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {group.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            overdue={isOverdue(item, today)}
            list={listById && item.listId ? listById.get(item.listId) : undefined}
            showDate={showDate}
            onToggle={() => onToggle(item)}
            onEdit={() => onEdit(item)}
          />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({
  item,
  overdue,
  list,
  showDate,
  onToggle,
  onEdit,
}: {
  item: ShoppingItem;
  overdue: boolean;
  list?: ShoppingList;
  showDate: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const done = !!item.boughtAt;
  const details = [
    item.priority === "want" ? "Want" : "Need",
    showDate && !done && item.dueDate && `${overdue ? "Was due" : "Buy"} ${formatDate(item.dueDate, { weekday: false, year: item.dueDate.slice(0, 4) !== String(new Date().getFullYear()) })}`,
    item.note,
  ].filter(Boolean);
  return (
    <li className="surface flex items-center gap-1 rounded-2xl border py-1 pr-3 pl-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark ${item.name} as not bought` : `Mark ${item.name} as bought`}
        onClick={onToggle}
        className="grid size-11 shrink-0 place-items-center rounded-full"
      >
        <span
          className={cn(
            "grid size-6 place-items-center rounded-full border-2 transition-colors",
            done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </button>
      <button type="button" onClick={onEdit} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{item.name}</span>
          <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", overdue && "text-primary")}>
            {list && (
              <span className="flex shrink-0 items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: paletteColor(list.color) }} />
                {list.name} ·
              </span>
            )}
            <span className="truncate">{details.join(" · ")}</span>
          </span>
        </span>
        {item.estimate !== undefined && (
          <span className={cn("text-sm font-medium tabular-nums", done && "text-muted-foreground")}>{formatMoney(item.estimate, item.currency)}</span>
        )}
      </button>
    </li>
  );
}

function ItemForm({ item, defaultListId, onDone }: { item: ShoppingItem | null; defaultListId?: string; onDone: () => void }) {
  const { data, refresh, currency: defaultCurrency } = useData();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(item?.name ?? "");
  const [priority, setPriority] = useState<ShoppingPriority>(item?.priority ?? "need");
  const [listId, setListId] = useState<string>(item ? (item.listId ?? "") : (defaultListId ?? ""));
  const [currency, setCurrency] = useState<CurrencyCode>(item?.currency ?? defaultCurrency);
  const [estimate, setEstimate] = useState(item?.estimate !== undefined ? toInputString(item.estimate, item.currency) : "");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [note, setNote] = useState(item?.note ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name the item.");
    const price = estimate.trim() ? parseAmount(estimate, currency) : undefined;
    if (price === null || (price !== undefined && price <= 0)) return toast.error("Enter a price greater than zero, or leave it empty.");
    const fields = {
      name: name.trim(),
      priority,
      listId: listId || undefined,
      currency,
      estimate: price,
      dueDate: dueDate || undefined,
      note: note.trim() || undefined,
    };
    if (item) await shoppingItemsRepo.update({ ...item, ...fields });
    else await shoppingItemsRepo.create(fields);
    await refresh();
    onDone();
  }

  async function remove() {
    if (!item || !(await confirm("Delete this item?", "It's removed from your shopping list."))) return;
    await shoppingItemsRepo.softDelete(item.id);
    await refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Field label="Item" htmlFor="item-name">
        <Input id="item-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rice 25kg, new phone" className="h-11 rounded-xl" />
      </Field>
      <Field label="Priority" hint={priority === "need" ? "Required — something you have to buy." : "Nice to have — buy when there's money left."}>
        <Segmented value={priority} onChange={setPriority} options={PRIORITIES} />
      </Field>
      {data.shoppingLists.length > 0 && (
        <Field label="List">
          <div className="flex flex-wrap gap-2">
            {[{ id: "", name: "No list", color: undefined as number | undefined }, ...data.shoppingLists].map((l) => (
              <button
                key={l.id || "none"}
                type="button"
                aria-pressed={listId === l.id}
                onClick={() => setListId(l.id)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  listId === l.id ? "border-ring/60 bg-primary text-primary-foreground" : "bg-card/40 hover:bg-accent",
                )}
              >
                {l.color !== undefined && <span className="size-2 rounded-full" style={{ background: paletteColor(l.color) }} />}
                {l.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Currency">
        <Segmented
          value={currency}
          onChange={(next: CurrencyCode) => {
            setCurrency(next);
            setEstimate("");
          }}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: `${CURRENCIES[code].symbol} ${CURRENCIES[code].short}` }))}
        />
      </Field>
      <Field label="Expected price (optional)">
        <AmountInput value={estimate} onChange={setEstimate} currency={currency} />
      </Field>
      <Field label="When to buy (optional)" htmlFor="item-date" hint="Used when grouping by day, week, or month.">
        <DateField id="item-date" value={dueDate} onChange={setDueDate} optional placeholder="No date" />
      </Field>
      <Field label="Note (optional)" htmlFor="item-note">
        <Input id="item-note" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Where to buy, size, brand…" className="h-11 rounded-xl" />
      </Field>
      <Button type="submit" className="h-12 rounded-full text-base">
        {item ? "Save" : "Add to list"}
      </Button>
      {item && (
        <Button type="button" variant="ghost" className="h-11 rounded-full text-expense" onClick={remove}>
          Delete item
        </Button>
      )}
      {dialog}
    </form>
  );
}

function ListForm({ list, onDone }: { list: ShoppingList | null; onDone: (saved: ShoppingList | null) => void }) {
  const { data, refresh } = useData();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(list?.name ?? "");
  const [color, setColor] = useState(list?.color ?? data.shoppingLists.length % 6);
  const itemCount = list ? data.shoppingItems.filter((i) => i.listId === list.id).length : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name the list.");
    const saved = list
      ? await shoppingListsRepo.update({ ...list, name: name.trim(), color })
      : await shoppingListsRepo.create({ name: name.trim(), color });
    await refresh();
    onDone(saved);
  }

  async function remove() {
    if (!list) return;
    const detail = itemCount ? `Its ${itemCount} item(s) stay on your shopping list, without a list.` : "The list is empty.";
    if (!(await confirm(`Delete "${list.name}"?`, detail))) return;
    await deleteShoppingList(list, data.shoppingItems);
    await refresh();
    onDone(null);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="list-name">
        <Input id="list-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries, Birthday party" className="h-11 rounded-xl" />
      </Field>
      <Field label="Color">
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4, 5].map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c + 1}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn("grid size-11 place-items-center rounded-full border", color === c && "ring-2 ring-ring")}
            >
              <span className="size-5 rounded-full" style={{ background: paletteColor(c) }} />
            </button>
          ))}
        </div>
      </Field>
      <Button type="submit" className="h-12 rounded-full text-base">
        {list ? "Save" : "Create list"}
      </Button>
      {list && (
        <Button type="button" variant="ghost" className="h-11 rounded-full text-expense" onClick={remove}>
          Delete list
        </Button>
      )}
      {dialog}
    </form>
  );
}
