import { Module } from '@nestjs/common';
import { CashDepositsController } from './cash-deposits.controller';
import { CashDepositsService } from './cash-deposits.service';

@Module({
  controllers: [CashDepositsController],
  providers: [CashDepositsService],
})
export class CashDepositsModule {}
