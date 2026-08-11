import { IsOptional, IsInt, Min, Max, IsString, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { LoanStatus } from '@prisma/client';

export class QueryLoanDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsEnum(LoanStatus) status?: LoanStatus;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() agentId?: string;
}
