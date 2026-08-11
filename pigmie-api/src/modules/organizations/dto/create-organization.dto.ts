import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  organizationName: string;

  @IsOptional()
  @IsString()
  operatorType?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsString()
  adminFullName: string;

  @IsEmail()
  adminEmail: string;
}
