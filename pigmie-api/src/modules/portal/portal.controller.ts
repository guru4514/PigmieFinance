import { Controller, Get, Param, UseGuards, ForbiddenException, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { PortalService } from './portal.service';
import { CustomerPdfService } from '../customers/customer-pdf.service';

@Controller('portal')
@UseGuards(SupabaseAuthGuard)
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly customerPdfService: CustomerPdfService
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getMe(user.organizationId, user.id);
  }

  @Get('loans')
  async getLoans(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoans(user.organizationId, user.id);
  }

  @Get('loans/:id')
  async getLoanDetails(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoanDetails(user.organizationId, user.id, id);
  }

  @Get('loans/:id/schedule')
  async getLoanSchedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoanSchedule(user.organizationId, user.id, id);
  }

  @Get('loans/:id/collections')
  async getLoanCollections(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
  }

  @Get('passbook')
  async downloadPassbook(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    
    const pdfBuffer = await this.customerPdfService.generatePassbook(user.id, user.organizationId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=passbook.pdf`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}

