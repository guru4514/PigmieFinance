import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'pigmie-offline';
const STORE_NAME = 'pending-collections';

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'clientGeneratedId' });
      }
    },
  });
}

export async function queueCollection(data: any): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { ...data, queuedAt: new Date().toISOString() });
}

export async function getPendingCollections(): Promise<any[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function removePendingCollection(clientGeneratedId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, clientGeneratedId);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

export async function processSyncQueue(): Promise<number> {
  const { apiClient } = await import('./api-client');
  const pending = await getPendingCollections();
  let synced = 0;
  
  for (const item of pending) {
    try {
      const { queuedAt, ...payload } = item;
      await apiClient.post('/collections', payload);
      await removePendingCollection(item.clientGeneratedId);
      synced++;
    } catch (error: any) {
      if (error?.response?.status === 409) {
        // Duplicate — already synced, remove from queue
        await removePendingCollection(item.clientGeneratedId);
        synced++;
      }
      // Other errors: keep in queue for retry
    }
  }
  
  return synced;
}
