import type {
  Account,
  Budget,
  Category,
  ExpenseTransaction,
  Goal,
  GoalEntry,
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
