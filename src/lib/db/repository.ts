import type { BaseRecord } from "@/lib/finance/types";
import { openDb, promisify, type StoreName, withTransaction } from "./idb";

/** Omit that keeps discriminated unions (e.g. Transaction) intact. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Fields the repository fills in; callers provide the rest. */
export type NewRecord<T extends BaseRecord> = DistributiveOmit<T, keyof BaseRecord> & { id?: string };

const now = () => new Date().toISOString();

/** Generic CRUD with soft delete. The single seam for future encryption/sync of stored records. */
export function createRepository<T extends BaseRecord>(store: StoreName) {
  return {
    /** Live records only (soft-deleted ones excluded). */
    async list(): Promise<T[]> {
      const all = await this.listIncludingDeleted();
      return all.filter((r) => !r.deletedAt);
    },

    async listIncludingDeleted(): Promise<T[]> {
      const db = await openDb();
      return promisify(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
    },

    async get(id: string): Promise<T | undefined> {
      const db = await openDb();
      return promisify(db.transaction(store).objectStore(store).get(id) as IDBRequest<T | undefined>);
    },

    build(input: NewRecord<T>): T {
      const timestamp = now();
      return {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
      } as unknown as T;
    },

    async create(input: NewRecord<T>): Promise<T> {
      const record = this.build(input);
      await withTransaction([store], "readwrite", (tx) => tx.objectStore(store).add(record));
      return record;
    },

    async update(record: T): Promise<T> {
      const updated = { ...record, updatedAt: now() };
      await withTransaction([store], "readwrite", (tx) => tx.objectStore(store).put(updated));
      return updated;
    },

    async softDelete(id: string): Promise<void> {
      const record = await this.get(id);
      if (!record || record.deletedAt) return;
      const timestamp = now();
      await withTransaction([store], "readwrite", (tx) =>
        tx.objectStore(store).put({ ...record, deletedAt: timestamp, updatedAt: timestamp }),
      );
    },
  };
}
