import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { EncryptionService } from '../../services/encryption.service';
import { CustomerPdfService } from './customer-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomersController],
  providers: [CustomersService, EncryptionService, CustomerPdfService],
  exports: [CustomersService, CustomerPdfService],
})
export class CustomersModule {}

