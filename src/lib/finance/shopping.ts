/**
 * Shopping list summaries. Pure functions; items are plans, so nothing here affects balances,
 * spending, budgets, or reports.
 */
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/money/currency";
import { type Minor, sumMinor } from "@/lib/money/money";
import { addDays, addMonths, formatDate, monthKey, monthLabel, parseLocalDate, startOfWeek, toLocalDate } from "./dates";
import type { LocalDate, ShoppingItem, ShoppingList } from "./types";

export interface ShoppingSummary {
  /** Items still to buy. */
  open: number;
  /** Open "need" items. */
  needs: number;
  /** Estimated cost of open needs / wants in this currency (items without an estimate add 0). */
  needEstimate: Minor;
  wantEstimate: Minor;
}

const isOpen = (item: ShoppingItem) => !item.deletedAt && !item.boughtAt;

export function shoppingSummary(items: readonly ShoppingItem[], currency: CurrencyCode): ShoppingSummary {
  const open = items.filter(isOpen);
  const estimate = (priority: ShoppingItem["priority"]) =>
    sumMinor(open.filter((i) => i.priority === priority && i.currency === currency).map((i) => i.estimate ?? 0));
  return {
    open: open.length,
    needs: open.filter((i) => i.priority === "need").length,
    needEstimate: estimate("need"),
    wantEstimate: estimate("want"),
  };
}

/** Open items first: needs before wants, then by due date (undated last), then oldest first. */
export function sortShoppingItems(items: readonly ShoppingItem[]): ShoppingItem[] {
  const rank = (i: ShoppingItem) => (i.priority === "need" ? 0 : 1);
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/** Open item past its buy-by date. */
export function isOverdue(item: ShoppingItem, today: LocalDate): boolean {
  return isOpen(item) && !!item.dueDate && item.dueDate < today;
}

/** Estimated cost of `items`, one entry per currency that has an estimate (dollar first, never mixed). */
export function estimateTotals(items: readonly ShoppingItem[]): { currency: CurrencyCode; total: Minor }[] {
  return CURRENCY_CODES.map((currency) => ({
    currency,
    total: sumMinor(items.filter((i) => i.currency === currency).map((i) => i.estimate ?? 0)),
  })).filter((t) => t.total > 0);
}

export type ShoppingGrouping = "priority" | "list" | "day" | "week" | "month";

export interface ShoppingGroup {
  key: string;
  label: string;
  items: ShoppingItem[];
  /** Open items whose buy-on date has passed. */
  overdue?: boolean;
  /** The list this group shows (grouping by list). */
  list?: ShoppingList;
}

/** The date an item is grouped on: when it was bought, else when it's planned to be bought. */
export function shoppingItemDate(item: ShoppingItem): LocalDate | undefined {
  return item.boughtAt ? toLocalDate(new Date(item.boughtAt)) : item.dueDate;
}

const OVERDUE = "0-overdue";
const NO_DATE = "~none";

/** "Mon, 20 Oct" (with the year when it isn't this year's). */
function shortDate(date: LocalDate, today: LocalDate, weekday = true): string {
  return formatDate(date, { weekday: weekday && "short", year: date.slice(0, 4) !== today.slice(0, 4) });
}

function dateLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return shortDate(date, today);
}

function weekLabel(week: LocalDate, today: LocalDate): string {
  const current = startOfWeek(today);
  if (week === current) return "This week";
  if (week === addDays(current, 7)) return "Next week";
  if (week === addDays(current, -7)) return "Last week";
  return `Week of ${shortDate(week, today, false)}`;
}

function monthGroupLabel(key: string, today: LocalDate): string {
  const current = monthKey(parseLocalDate(today));
  if (key === current) return "This month";
  if (key === addMonths(current, 1)) return "Next month";
  if (key === addMonths(current, -1)) return "Last month";
  const label = monthLabel(key);
  return key.slice(0, 4) === current.slice(0, 4) ? label : `${label} ${key.slice(0, 4)}`;
}

/**
 * Group items for display. Date groupings use `shoppingItemDate`; open items whose date has passed go in
 * one "Overdue" group first, undated items in "No date" last. `newestFirst` orders date groups (and the
 * items in them) newest first — for the Bought tab.
 */
export function groupShoppingItems(
  items: readonly ShoppingItem[],
  by: ShoppingGrouping,
  today: LocalDate,
  lists: readonly ShoppingList[],
  { newestFirst = false }: { newestFirst?: boolean } = {},
): ShoppingGroup[] {
  const ordered = newestFirst
    ? [...items].sort((a, b) => (b.boughtAt ?? b.createdAt).localeCompare(a.boughtAt ?? a.createdAt))
    : sortShoppingItems(items);

  if (by === "priority") {
    return [
      { key: "need", label: "Needs", items: ordered.filter((i) => i.priority === "need") },
      { key: "want", label: "Wants", items: ordered.filter((i) => i.priority === "want") },
    ].filter((g) => g.items.length > 0);
  }

  if (by === "list") {
    const known = new Set(lists.map((l) => l.id));
    const groups: ShoppingGroup[] = lists.map((list) => ({
      key: list.id,
      label: list.name,
      list,
      items: ordered.filter((i) => i.listId === list.id),
    }));
    groups.push({ key: NO_DATE, label: "No list", items: ordered.filter((i) => !i.listId || !known.has(i.listId)) });
    return groups.filter((g) => g.items.length > 0);
  }

  const buckets = new Map<string, ShoppingItem[]>();
  for (const item of ordered) {
    const date = shoppingItemDate(item);
    let key: string;
    if (!date) key = NO_DATE;
    else if (!item.boughtAt && date < today) key = OVERDUE;
    else if (by === "day") key = date;
    else if (by === "week") key = startOfWeek(date);
    else key = date.slice(0, 7);
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === OVERDUE || b === NO_DATE) return -1;
    if (b === OVERDUE || a === NO_DATE) return 1;
    return newestFirst ? b.localeCompare(a) : a.localeCompare(b);
  });

  return keys.map((key) => {
    const label =
      key === OVERDUE
        ? "Overdue"
        : key === NO_DATE
          ? "No date"
          : by === "day"
            ? dateLabel(key, today)
            : by === "week"
              ? weekLabel(key, today)
              : monthGroupLabel(key, today);
    return { key, label, items: buckets.get(key)!, overdue: key === OVERDUE || undefined };
  });
}
