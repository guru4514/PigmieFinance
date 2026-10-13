import { useEffect, useState } from 'react';
import { getAccountPendingCount, QUEUE_CHANGED_EVENT } from '@/shared/lib/offline-queue';

export function AccountRecovery({ authUserId, retry }: { authUserId: string; retry: () => void }) {
  const [saved, setSaved] = useState<{ account: string; count?: number; unavailable?: boolean }>();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getAccountPendingCount(authUserId).then((count) => {
        if (active) setSaved({ account: authUserId, count });
      }).catch(() => { if (active) setSaved({ account: authUserId, unavailable: true }); });
    };
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => { active = false; window.removeEventListener(QUEUE_CHANGED_EVENT, refresh); };
  }, [authUserId]);
  const current = saved?.account === authUserId ? saved : undefined;
  return <main className="flex min-h-screen items-center justify-center p-6">
    <div className="max-w-md space-y-4 text-center">
      <h1 className="text-xl font-semibold">Connect to recover your workspace</h1>
      <p>We could not verify your account. Reconnect and try again to open your workspace and sync saved collections.</p>
      {current?.count !== undefined && <p role="status">{current.count} collection(s) saved on this device for this account.</p>}
      {current?.unavailable && <p role="alert">Device storage is unavailable. Retry in the original browser profile. This does not prove that saved collections are missing.</p>}
      <p className="text-sm text-muted-foreground">This does not clear saved collections. Avoid clearing site data or uninstalling the app while payments are waiting to sync. Device storage alone is not a backup.</p>
      <button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={retry}>Try again</button>
    </div>
  </main>;
}
