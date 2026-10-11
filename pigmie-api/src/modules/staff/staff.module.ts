import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvisioningReconciliationService } from './provisioning-reconciliation.service';

@Module({
  imports: [PrismaModule],
  controllers: [StaffController],
  providers: [StaffService, ProvisioningReconciliationService],
  exports: [StaffService],
})
export class StaffModule {}
