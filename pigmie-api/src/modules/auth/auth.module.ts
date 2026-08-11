import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EncryptionService } from '../../services/encryption.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, EncryptionService],
})
export class AuthModule {}

