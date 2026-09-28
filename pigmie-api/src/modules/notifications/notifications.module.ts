import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsService],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}

