import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { CustomersModule } from '../customers/customers.module';
import { LoansModule } from '../loans/loans.module';

@Module({
  imports: [CustomersModule, LoansModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}

