import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
import { offerAppUpdate } from './app-update';

describe('Safe service-worker activation', () => {
  it('waits for an explicit reload action instead of interrupting a payment form', async () => {
    mocks.toast.mockClear();
    const activate = vi.fn().mockResolvedValue(undefined);
    offerAppUpdate(activate);
    expect(activate).not.toHaveBeenCalled();
    const options = mocks.toast.mock.calls[0][1];
    expect(options.description).toContain('Finish or save');
    expect(options.duration).toBe(Infinity);
    options.action.onClick();
    expect(activate).toHaveBeenCalledOnce();
  });
  it('reports activation failures without claiming collection loss', async () => {
    mocks.toast.mockClear(); mocks.toast.error.mockClear();
    offerAppUpdate(async () => { throw new Error('synthetic failure'); });
    mocks.toast.mock.calls[0][1].action.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('remain on this device'));
  });
});
