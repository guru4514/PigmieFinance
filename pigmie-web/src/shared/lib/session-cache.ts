import { QueryClient } from '@tanstack/react-query';

/** Clear previous-account data without touching the separately owned IndexedDB outbox. */
export async function clearPreviousAccountQueries(client: QueryClient, authUserId: string | null, isCurrent: () => boolean): Promise<boolean> {
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] !== 'auth' || authUserId === null || query.queryKey[2] !== authUserId;
  await client.cancelQueries({ predicate });
  if (!isCurrent()) return false;
  client.removeQueries({ predicate });
  return true;
}
