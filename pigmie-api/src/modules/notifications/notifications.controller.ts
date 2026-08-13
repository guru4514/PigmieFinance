import { Controller, Get, Patch, Post, Param, UseGuards, Query, Body, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { NotificationsService } from './notifications.service';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';

export class NotificationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService
  ) {}

  @Post('subscribe')
  @UseGuards(SupabaseAuthGuard)
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() subscriptionData: any
  ) {
    let authUserId: string | null = null;
    if (user.type === 'staff') {
      const staff = await this.prisma.staff.findUnique({ where: { id: user.id } });
      authUserId = staff?.authUserId || null;
    } else if (user.type === 'customer') {
      const customer = await this.prisma.customer.findUnique({ where: { id: user.id } });
      authUserId = customer?.authUserId || null;
    }

    if (!authUserId) {
      throw new UnauthorizedException('User not found');
    }

    return this.notificationsService.subscribe(authUserId, subscriptionData);
  }

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.notificationsService.getVapidPublicKey() };
  }

  @Get()
  @UseGuards(SupabaseAuthGuard)
  async getNotifications(@Query() query: NotificationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getNotifications(user.organizationId, user.type, user.id, query);
  }

  @Patch(':id/read')
  @UseGuards(SupabaseAuthGuard)
  async markAsRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAsRead(user.organizationId, id);
  }

  @Patch('read-all')
  @UseGuards(SupabaseAuthGuard)
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.organizationId, user.type, user.id);
  }
}
