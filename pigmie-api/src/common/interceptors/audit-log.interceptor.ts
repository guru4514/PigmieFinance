import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const action = Reflect.getMetadata(AUDIT_ACTION_KEY, context.getHandler());
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(async (result) => {
        const organizationId = request.user.organizationId ?? result?.organization?.id ?? null;
        if (!organizationId) return;

        await this.prisma.auditLog.create({
          data: {
            organizationId,
            actorStaffId: request.user.type === 'staff' ? request.user.id : null,
            action,
            entityType: action.split('.')[0],
            entityId: result?.id ?? result?.organization?.id ?? request.params?.id ?? null,
            newValue: result || undefined,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
      }),
    );
  }
}
