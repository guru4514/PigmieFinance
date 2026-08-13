import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class OrgThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.organizationId) {
      return `org:${req.user.organizationId}`;
    }
    return `ip:${req.ips?.length ? req.ips[0] : req.ip}`;
  }
}
