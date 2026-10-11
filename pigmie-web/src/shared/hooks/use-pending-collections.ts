import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./use-auth";
import {
  getCollectionOwner,
  getLegacyPendingCount,
  getPendingCollections,
  QUEUE_CHANGED_EVENT,
  type PendingCollection,
} from "../lib/offline-queue";

export function usePendingCollections() {
  const { session, user } = useAuth();
  const owner = useMemo(
    () => getCollectionOwner(session?.user.id, user),
    [session?.user.id, user],
  );
  const ownerKey = owner
    ? `${owner.authUserId}:${owner.organizationId}:${owner.staffId}`
    : "";
  const [state, setState] = useState<{
    key: string;
    items: PendingCollection[];
    legacyCount: number;
    error: string | null;
  }>({ key: "", items: [], legacyCount: 0, error: null });

  useEffect(() => {
    if (!owner) return;
    let active = true;
    const refresh = async () => {
      try {
        const [items, legacyCount] = await Promise.all([
          getPendingCollections(owner),
          getLegacyPendingCount(),
        ]);
        if (active)
          setState({ key: ownerKey, items, legacyCount, error: null });
      } catch {
        if (active)
          setState({
            key: ownerKey,
            items: [],
            legacyCount: 0,
            error:
              "Could not read saved collections on this device. Do not clear browser data; retry before recording more payments.",
          });
      }
    };
    void refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [owner, ownerKey]);

  const current = state.key === ownerKey ? state : undefined;
  return {
    owner,
    pendingCollections: current?.items ?? [],
    legacyCount: current?.legacyCount ?? 0,
    queueError: current?.error ?? null,
    queueLoading: !!owner && !current,
  };
}
