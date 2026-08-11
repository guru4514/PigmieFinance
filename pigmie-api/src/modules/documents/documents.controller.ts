import {
  Controller, Get, Post, Param, Body, UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { DocumentsService } from './documents.service';
import { RequestUploadUrlDto, RegisterDocumentDto } from './dto/document.dto';

@Controller('documents')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-url')
  @Roles('org_admin', 'branch_manager', 'agent')
  @AuditAction('document.request_upload')
  async getUploadUrl(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestUploadUrlDto) {
    return this.documentsService.getUploadUrl(user.organizationId, user.id, dto);
  }

  @Post()
  @Roles('org_admin', 'branch_manager', 'agent')
  @AuditAction('document.register')
  async registerDocument(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDocumentDto) {
    return this.documentsService.registerDocument(user.organizationId, user.id, dto);
  }

  @Get(':id/download-url')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getDownloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.getSignedDownloadUrl(user.organizationId, id);
  }

  @Get('entity/:entityType/:entityId')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findByEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.documentsService.findByEntity(user.organizationId, entityType, entityId);
  }
}

