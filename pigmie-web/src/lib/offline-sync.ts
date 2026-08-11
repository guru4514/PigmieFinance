import { openDB } from 'idb';

const DB_NAME = 'pigmie-offline-db';
const STORE_NAME = 'sync-queue';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function addToSyncQueue(endpoint: string, method: string, payload: any) {
  const db = await getDB();
  await db.add(STORE_NAME, {
    endpoint,
    method,
    payload,
    timestamp: Date.now(),
  });
}

export async function processSyncQueue() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const items = await store.getAll();
  
  if (items.length === 0) return;

  for (const item of items) {
    try {
      const response = await fetch(item.endpoint, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item.payload),
      });

      if (response.ok) {
        // Delete item within a new transaction as the previous one might have closed
        const delTx = db.transaction(STORE_NAME, 'readwrite');
        await delTx.objectStore(STORE_NAME).delete(item.id);
        await delTx.done;
      } else {
        console.error('Failed to sync item', item);
      }
    } catch (error) {
      console.error('Error syncing item', error);
      break; // Stop processing if offline again
    }
  }
}
