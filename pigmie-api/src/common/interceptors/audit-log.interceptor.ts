import {
  Injectable,
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator';
import { RequestUser } from '../types/request-user.type';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const action: unknown = Reflect.getMetadata(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    // LOGIN already has an explicit service-level event, including failure handling.
    if (typeof action !== 'string' || action === 'LOGIN') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const user = request.user;
        const organization = object(object(result).organization);
        const organizationId =
          user && user.type !== 'unprovisioned'
            ? user.organizationId
            : organization.id;
        if (typeof organizationId !== 'string' || !isUUID(organizationId))
          return result;
        const candidates = [
          object(result).id,
          object(object(result).collection).id,
          object(object(result).loan).id,
          organization.id,
          request.params.id,
        ];
        const entityId =
          candidates.find(
            (id): id is string => typeof id === 'string' && isUUID(id),
          ) ?? organizationId;
        try {
          // Generic audits contain metadata only. Never serialize request/response payloads.
          await this.prisma.auditLog.create({
            data: {
              organizationId,
              actorStaffId: user?.type === 'staff' ? user.id : null,
              action,
              entityType: action.split('.')[0],
              entityId,
              newValue: { outcome: 'succeeded' },
              ipAddress: request.ip,
              userAgent: request.headers['user-agent']?.slice(0, 512),
            },
          });
        } catch {
          this.logger.error(
            `Audit persistence failed for action ${action}; the operation already succeeded`,
          );
        }
        return result;
      }),
    );
  }
}
