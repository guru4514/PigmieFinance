import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { BranchesController } from './branches.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController, BranchesController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

