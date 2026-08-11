import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { IdProofType } from '@prisma/client';

export class UpdateCustomerDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEnum(IdProofType) idProofType?: IdProofType;
  @IsOptional() @IsString() idProofNumber?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() guarantorName?: string;
  @IsOptional() @IsString() guarantorPhone?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() assignedAgentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
