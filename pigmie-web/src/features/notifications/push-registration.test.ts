import { describe, expect, it, vi } from 'vitest';
import { registerBrowserPush } from './push-registration';

function harness() {
  const old = { endpoint: 'old', toJSON: () => ({ endpoint: 'old' }), unsubscribe: vi.fn().mockResolvedValue(true) };
  const replacement = { endpoint: 'new', toJSON: () => ({ endpoint: 'new' }), unsubscribe: vi.fn().mockResolvedValue(true) };
  const dependencies = {
    currentAccount: vi.fn().mockResolvedValue(true),
    existing: vi.fn().mockResolvedValue(old),
    create: vi.fn().mockResolvedValue(replacement),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return { old, replacement, dependencies };
}

describe('Browser push account recovery', () => {
  it('replaces a conflicting existing endpoint through native unsubscribe without accessing the former account', async () => {
    const h = harness();
    h.dependencies.save.mockRejectedValueOnce({ response: { status: 409 } });
    await registerBrowserPush(h.dependencies);
    expect(h.old.unsubscribe).toHaveBeenCalledOnce();
    expect(h.dependencies.save.mock.calls).toEqual([[{ endpoint: 'old' }], [{ endpoint: 'new' }]]);
    expect(h.old.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(h.dependencies.create.mock.invocationCallOrder[0]);
  });
  it.each([401, 403, 503, undefined])('preserves native subscription for nonconflict failure %s', async (status) => {
    const h = harness();
    h.dependencies.save.mockRejectedValue({ response: { status } });
    await expect(registerBrowserPush(h.dependencies)).rejects.toBeDefined();
    expect(h.old.unsubscribe).not.toHaveBeenCalled();
    expect(h.dependencies.create).not.toHaveBeenCalled();
  });
  it('stops before resetting browser state if the account changes after a conflict', async () => {
    const h = harness();
    h.dependencies.save.mockImplementation(async () => {
      h.dependencies.currentAccount.mockResolvedValue(false);
      throw { response: { status: 409 } };
    });
    await expect(registerBrowserPush(h.dependencies)).rejects.toThrow('account changed');
    expect(h.old.unsubscribe).not.toHaveBeenCalled();
  });
  it('does not retry after native unsubscribe fails or the provider returns the same endpoint', async () => {
    for (const unchanged of [false, true]) {
      const h = harness();
      h.dependencies.save.mockRejectedValueOnce({ response: { status: 409 } });
      if (unchanged) h.dependencies.create.mockResolvedValue(h.old);
      else h.old.unsubscribe.mockResolvedValue(false);
      await expect(registerBrowserPush(h.dependencies)).rejects.toThrow();
      expect(h.dependencies.save).toHaveBeenCalledOnce();
    }
  });
  it('serializes registration attempts and resumes after a failed attempt', async () => {
    const h = harness();
    let finish!: () => void;
    h.dependencies.save.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = registerBrowserPush(h.dependencies);
    await vi.waitFor(() => expect(h.dependencies.save).toHaveBeenCalledOnce());
    const next = harness();
    const second = registerBrowserPush(next.dependencies);
    await Promise.resolve();
    expect(next.dependencies.existing).not.toHaveBeenCalled();
    finish();
    await Promise.all([first, second]);
    expect(next.dependencies.save).toHaveBeenCalledOnce();
    const failed = harness();
    failed.dependencies.currentAccount.mockResolvedValue(false);
    await expect(registerBrowserPush(failed.dependencies)).rejects.toThrow();
    await expect(registerBrowserPush(harness().dependencies)).resolves.toBeUndefined();
  });
});
