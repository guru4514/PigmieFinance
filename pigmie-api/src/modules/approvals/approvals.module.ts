import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { CollectionsModule } from '../collections/collections.module';
import { LoansModule } from '../loans/loans.module';

@Module({
  imports: [PrismaModule, CustomersModule, CollectionsModule, LoansModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
