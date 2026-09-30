import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

// Core
import { PrismaModule } from './prisma/prisma.module';
import { validate } from './config/env.validation';
import { OrgThrottlerGuard } from './common/guards/org-throttler.guard';

// Feature modules
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { StaffModule } from './modules/staff/staff.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { LoanProductsModule } from './modules/loan-products/loan-products.module';
import { LoansModule } from './modules/loans/loans.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PortalModule } from './modules/portal/portal.module';
import { CashDepositsModule } from './modules/cash-deposits/cash-deposits.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';

@Module({
  imports: [
    // Global config — validates .env on startup via Zod
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),

    // Rate limiting — 300 requests per 60 seconds per IP/org
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 300,
    }]),

    // Scheduled jobs (overdue detection, late fees)
    ScheduleModule.forRoot(),

    // Core
    PrismaModule,

    // Feature modules
    HealthModule,
    AuthModule,
    OrganizationsModule,
    StaffModule,
    CustomersModule,
    DocumentsModule,
    LoanProductsModule,
    LoansModule,
    CollectionsModule,
    ReportsModule,
    NotificationsModule,
    PortalModule,
    CashDepositsModule,
    JobsModule,
    AuditLogsModule,
    ApprovalsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OrgThrottlerGuard,
    },
  ],
})
export class AppModule {}
