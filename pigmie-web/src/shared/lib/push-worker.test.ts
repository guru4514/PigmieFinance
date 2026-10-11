import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const deleteCache = vi.fn().mockResolvedValue(true);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync(new URL('../../../public/push-worker.js', import.meta.url), 'utf8'), {
    URL,
    caches: { delete: deleteCache },
    self: {
      addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => handlers.set(name, handler),
      location: { origin: 'https://example.test' },
      registration: { showNotification },
      clients: { matchAll: async () => [], openWindow },
    },
  });
  async function dispatch(name: string, data: Record<string, unknown>) {
    let completion: Promise<unknown> | undefined;
    handlers.get(name)!({ ...data, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
    await completion;
  }
  return { dispatch, showNotification, deleteCache, openWindow };
}

describe('Shared-device push privacy', () => {
  it('purges the legacy account caches without clearing other storage', async () => {
    const fixture = worker();
    await fixture.dispatch('activate', {});
    expect(fixture.deleteCache.mock.calls.map(([name]) => name)).toEqual([
      'due-today-cache', 'customers-cache', 'loans-cache', 'dashboard-cache', 'static-assets',
    ]);
  });
  it('never displays financial payload details, including malformed payloads', async () => {
    const fixture = worker();
    await fixture.dispatch('push', { data: { json: () => ({ title: 'Private borrower', body: 'Balance 1234', url: 'https://external.test' }) } });
    await fixture.dispatch('push', { data: { json: () => { throw new Error('Malformed'); } } });
    for (const [title, options] of fixture.showNotification.mock.calls) {
      expect(title).toBe('PigmieFinance');
      expect(options.body).toBe('You have a new notification. Sign in to view it.');
      expect(options.data.url).toBe('/app/dashboard');
    }
  });
  it('restricts notification navigation to the application origin', async () => {
    const fixture = worker();
    const close = vi.fn();
    await fixture.dispatch('notificationclick', { notification: { close, data: { url: 'https://external.test' } } });
    expect(close).toHaveBeenCalledOnce();
    expect(fixture.openWindow).toHaveBeenCalledWith('https://example.test/app/dashboard');
    await fixture.dispatch('notificationclick', { notification: { close, data: { url: '/portal/dashboard' } } });
    expect(fixture.openWindow).toHaveBeenLastCalledWith('https://example.test/portal/dashboard');
  });
});
