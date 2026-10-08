import type {
  Account,
  Budget,
  Category,
  Goal,
  GoalEntry,
  Transaction,
  TransferTransaction,
  ExpenseTransaction,
} from "@/lib/finance/types";
import { withTransaction } from "./idb";
import { createRepository, type NewRecord } from "./repository";

export const accountsRepo = createRepository<Account>("accounts");
export const categoriesRepo = createRepository<Category>("categories");
export const transactionsRepo = createRepository<Transaction>("transactions");
export const budgetsRepo = createRepository<Budget>("budgets");
export const goalsRepo = createRepository<Goal>("goals");
export const goalEntriesRepo = createRepository<GoalEntry>("goalEntries");

/**
 * Save a transfer and its optional fee in one IndexedDB transaction.
 * The fee is a separate expense so it counts as spending; the moved amount does not.
 */
export async function createTransferWithFee(
  transfer: NewRecord<TransferTransaction>,
  fee?: Omit<NewRecord<ExpenseTransaction>, "transferId">,
): Promise<TransferTransaction> {
  if (transfer.fromAccountId === transfer.toAccountId) {
    throw new Error("A transfer needs two different accounts.");
  }
  const record = transactionsRepo.build(transfer) as TransferTransaction;
  const feeRecord = fee ? transactionsRepo.build({ ...fee, transferId: record.id }) : undefined;

  await withTransaction(["transactions"], "readwrite", (tx) => {
    const store = tx.objectStore("transactions");
    store.add(record);
    if (feeRecord) store.add(feeRecord);
  });
  return record;
}
