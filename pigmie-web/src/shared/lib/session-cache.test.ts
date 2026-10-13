import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { clearPreviousAccountQueries } from './session-cache';

describe('Account query isolation', () => {
  it('removes business data and the former identity while keeping the current identity bootstrap', async () => {
    const client = new QueryClient();
    client.setQueryData(['auth', 'me', 'account-a'], { id: 'staff-a' });
    client.setQueryData(['auth', 'me', 'account-b'], { id: 'staff-b' });
    client.setQueryData(['collections', 'today'], [{ customer: 'synthetic-a' }]);
    client.setQueryData(['loans'], [{ id: 'synthetic-a' }]);
    expect(await clearPreviousAccountQueries(client, 'account-b', () => true)).toBe(true);
    expect(client.getQueryData(['auth', 'me', 'account-a'])).toBeUndefined();
    expect(client.getQueryData(['collections', 'today'])).toBeUndefined();
    expect(client.getQueryData(['loans'])).toBeUndefined();
    expect(client.getQueryData(['auth', 'me', 'account-b'])).toEqual({ id: 'staff-b' });
  });
  it('clears all queries on sign-out', async () => {
    const client = new QueryClient(); client.setQueryData(['auth', 'me', 'account-a'], { id: 'staff-a' });
    await clearPreviousAccountQueries(client, null, () => true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it('does not erase newer account data when an earlier transition was cancelled', async () => {
    const client = new QueryClient(); client.setQueryData(['auth', 'me', 'account-b'], { id: 'staff-b' });
    expect(await clearPreviousAccountQueries(client, 'account-a', () => false)).toBe(false);
    expect(client.getQueryData(['auth', 'me', 'account-b'])).toEqual({ id: 'staff-b' });
  });
  it('prevents a cancelled former-account response from restoring business data', async () => {
    const client = new QueryClient();
    let resolve!: (data: string[]) => void;
    const response = new Promise<string[]>((done) => { resolve = done; });
    const pending = client.fetchQuery({ queryKey: ['loans'], queryFn: () => response }).catch(() => undefined);
    await clearPreviousAccountQueries(client, 'account-b', () => true);
    resolve(['private-account-a']);
    await pending;
    expect(client.getQueryData(['loans'])).toBeUndefined();
  });
});
