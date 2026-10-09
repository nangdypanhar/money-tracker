import type {
  Account,
  Budget,
  Category,
  ExpenseTransaction,
  Goal,
  GoalEntry,
  ShoppingItem,
  ShoppingList,
  Transaction,
  TransferTransaction,
} from "@/lib/finance/types";
import { withTransaction } from "./idb";
import { createRepository, type NewRecord } from "./repository";

export const accountsRepo = createRepository<Account>("accounts");
export const categoriesRepo = createRepository<Category>("categories");
export const transactionsRepo = createRepository<Transaction>("transactions");
export const budgetsRepo = createRepository<Budget>("budgets");
export const goalsRepo = createRepository<Goal>("goals");
export const goalEntriesRepo = createRepository<GoalEntry>("goalEntries");
export const shoppingItemsRepo = createRepository<ShoppingItem>("shoppingItems");
export const shoppingListsRepo = createRepository<ShoppingList>("shoppingLists");

type FeeInput = Omit<NewRecord<ExpenseTransaction>, "transferId">;

/**
 * Save a transfer and its optional fee in one IndexedDB transaction.
 * The fee is a separate expense so it counts as spending; the moved amount does not.
 * When editing, pass the existing transfer and its existing fee (if any).
 */
export async function saveTransfer(
  transfer: NewRecord<TransferTransaction> | TransferTransaction,
  fee: FeeInput | null,
  existingFee?: ExpenseTransaction,
): Promise<void> {
  if (transfer.fromAccountId === transfer.toAccountId) {
    throw new Error("A transfer needs two different accounts.");
  }
  const now = new Date().toISOString();
  const record: TransferTransaction =
    "createdAt" in transfer
      ? { ...transfer, updatedAt: now }
      : (transactionsRepo.build(transfer) as TransferTransaction);

  await withTransaction(["transactions"], "readwrite", (tx) => {
    const store = tx.objectStore("transactions");
    store.put(record);
    if (fee && existingFee) {
      store.put({ ...existingFee, ...fee, transferId: record.id, updatedAt: now });
    } else if (fee) {
      store.put(transactionsRepo.build({ ...fee, transferId: record.id }));
    } else if (existingFee) {
      store.put({ ...existingFee, deletedAt: now, updatedAt: now });
    }
  });
}

/** Soft-delete a transaction; deleting a transfer also deletes its fee. */
export async function deleteTransaction(target: Transaction, all: readonly Transaction[]): Promise<void> {
  const now = new Date().toISOString();
  const linked =
    target.type === "transfer"
      ? all.filter((t) => t.type === "expense" && t.transferId === target.id && !t.deletedAt)
      : [];
  await withTransaction(["transactions"], "readwrite", (tx) => {
    const store = tx.objectStore("transactions");
    for (const t of [target, ...linked]) store.put({ ...t, deletedAt: now, updatedAt: now });
  });
}

/** Soft-delete several shopping list items at once (e.g. "Clear bought"). */
export async function deleteShoppingItems(items: readonly ShoppingItem[]): Promise<void> {
  const now = new Date().toISOString();
  await withTransaction(["shoppingItems"], "readwrite", (tx) => {
    const store = tx.objectStore("shoppingItems");
    for (const item of items) store.put({ ...item, deletedAt: now, updatedAt: now });
  });
}

/** Soft-delete a shopping list; its items stay on the shopping list without a list. One transaction. */
export async function deleteShoppingList(list: ShoppingList, items: readonly ShoppingItem[]): Promise<void> {
  const now = new Date().toISOString();
  await withTransaction(["shoppingLists", "shoppingItems"], "readwrite", (tx) => {
    tx.objectStore("shoppingLists").put({ ...list, deletedAt: now, updatedAt: now });
    const store = tx.objectStore("shoppingItems");
    for (const item of items) {
      if (item.listId === list.id) store.put({ ...item, listId: undefined, updatedAt: now });
    }
  });
}
