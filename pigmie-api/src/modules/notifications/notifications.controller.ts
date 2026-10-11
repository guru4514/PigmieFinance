import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
  Query,
  Body,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms.service';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { SendSmsDto, BulkSmsDto } from './sms.dto';

import { Roles } from '../../common/decorators/roles.decorator';

import { RolesGuard } from '../../common/guards/roles.guard';

export class NotificationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number =
    20;
}

@Controller('notifications')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
  ) {}

  @Post('subscribe')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() subscriptionData: unknown,
  ) {
    return this.notificationsService.subscribe(
      user.organizationId,
      user.type,
      user.id,
      subscriptionData,
    );
  }

  @Post('unsubscribe')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() subscriptionData: unknown,
  ) {
    return this.notificationsService.unsubscribe(
      user.organizationId,
      user.type,
      user.id,
      subscriptionData,
    );
  }

  @Get('vapid-public-key')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  getVapidPublicKey() {
    return { publicKey: this.notificationsService.getVapidPublicKey() };
  }

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getNotifications(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.getNotifications(
      user.organizationId,
      user.type,
      user.id,
      query,
    );
  }

  @Patch(':id/read')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(
      user.organizationId,
      id,
      user.type,
      user.id,
    );
  }

  @Patch('read-all')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(
      user.organizationId,
      user.type,
      user.id,
    );
  }

  @Post('send-sms')
  @Roles('org_admin', 'branch_manager')
  async sendSms(
    @Body() data: SendSmsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.notificationsService.authorizeSmsRecipients(
      user.organizationId,
      user.id,
      [data.phone],
    );
    const success = await this.smsService.sendSMS(data.phone, data.message);
    return { success };
  }

  @Post('send-bulk-reminders')
  @Roles('org_admin', 'branch_manager')
  async sendBulkReminders(
    @Body() data: BulkSmsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.notificationsService.authorizeSmsRecipients(
      user.organizationId,
      user.id,
      data.recipients.map((recipient) => recipient.phone),
    );
    return this.smsService.sendBulkSMS(data.recipients);
  }
}
