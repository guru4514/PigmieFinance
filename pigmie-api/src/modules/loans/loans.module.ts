import { Module } from '@nestjs/common';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { PdfService } from './pdf.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LoansController],
  providers: [LoansService, PdfService],
  exports: [LoansService, PdfService],
})
export class LoansModule {}
