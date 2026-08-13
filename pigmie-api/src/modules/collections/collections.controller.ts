import {
  Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto, SyncCollectionsDto, ReverseCollectionDto, QueryCollectionDto } from './dto/collection.dto';

@Controller('collections')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('due-today')
  @Roles('org_admin', 'branch_manager', 'agent')
  async getDueToday(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.getDueToday(user.organizationId, user);
  }

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryCollectionDto) {
    return this.collectionsService.findAll(user.organizationId, query, user);
  }

  @Post()
  @Roles('org_admin', 'branch_manager', 'agent')
  @AuditAction('collection.record')
  async record(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionDto) {
    return this.collectionsService.recordCollection(user.organizationId, user.id, dto);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager', 'agent')
  @AuditAction('collection.sync')
  async sync(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncCollectionsDto) {
    return this.collectionsService.syncCollections(user.organizationId, user.id, dto.collections);
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  @AuditAction('collection.reverse')
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReverseCollectionDto,
  ) {
    return this.collectionsService.reverseCollection(user.organizationId, id, user.id, dto.reason);
  }

  @Get(':id/receipt')
  @Roles('agent', 'branch_manager', 'org_admin')
  @AuditAction('collection.receipt')
  async getReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.collectionsService.generateReceipt(user.organizationId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=receipt.pdf',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}

