import { IsOptional, IsString, IsInt, Min, Max, IsUUID, IsEnum, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}

export class OverdueQueryDto extends ReportQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minDaysOverdue?: number;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() agentId?: string;
}

export class CollectionEfficiencyQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsIn(['agent', 'branch', 'day']) groupBy?: 'agent' | 'branch' | 'day' = 'agent';
}

export class ExportQueryDto {
  @IsIn(['customers', 'loans', 'collections', 'schedule']) type: 'customers' | 'loans' | 'collections' | 'schedule';
  @IsIn(['csv']) format: 'csv';
}
