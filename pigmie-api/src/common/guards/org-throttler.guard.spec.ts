import { OrgThrottlerGuard } from './org-throttler.guard';

describe('OrgThrottlerGuard', () => {
  let guard: OrgThrottlerGuard;

  beforeEach(() => {
    // ThrottlerGuard constructor takes options, storageService, reflector, moduleRef
    // For unit testing getTracker, we don't need real dependencies initialized
    guard = new (OrgThrottlerGuard as any)();
  });

  it('should return org:organizationId when req.user has organizationId', async () => {
    const req = {
      user: {
        id: 'user-1',
        organizationId: 'org-123',
      },
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('org:org-123');
  });

  it('should fallback to ip:req.ips[0] when req.user is undefined and req.ips exists', async () => {
    const req = {
      ips: ['192.168.1.1', '10.0.0.1'],
      ip: '127.0.0.1',
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:192.168.1.1');
  });

  it('should fallback to ip:req.ip when req.user is undefined and req.ips is empty or undefined', async () => {
    const req = {
      ips: [],
      ip: '127.0.0.1',
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:127.0.0.1');
  });

  it('should fallback to ip when req.user has no organizationId', async () => {
    const req = {
      user: {
        type: 'unprovisioned',
      },
      ip: '10.0.0.5',
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:10.0.0.5');
  });
});
