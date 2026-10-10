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
  const { supabase } = await import('./supabase');
  
  // 1. Force a session refresh/check before syncing to avoid 401s after being offline for hours
  await supabase.auth.getSession();

  const pending = await getPendingCollections();
  let synced = 0;
  
  for (const item of pending) {
    try {
      
      let { queuedAt, offlinePhotoBase64, ...payload } = item;
      
      if (offlinePhotoBase64) {
        try {
          const { supabase } = await import('./supabase');
          // Convert base64 back to Blob
          const res = await fetch(offlinePhotoBase64);
          const blob = await res.blob();
          
          const fileName = `collections/${crypto.randomUUID()}.jpg`;
          const { data: uploadData, error } = await supabase.storage
            .from('collection-photos')
            .upload(fileName, blob, {
              contentType: blob.type || 'image/jpeg',
              upsert: false,
            });
            
          if (!error && uploadData) {
            const { data: urlData } = supabase.storage
              .from('collection-photos')
              .getPublicUrl(uploadData.path);
            payload.photoUrl = urlData.publicUrl;
          }
        } catch (photoErr) {
          console.error('Failed to upload offline photo during sync, proceeding without photo', photoErr);
        }
      }
      
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
