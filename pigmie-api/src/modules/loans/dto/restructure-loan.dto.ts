import { IsInt, IsString, Min, IsOptional } from 'class-validator';

export class RestructureLoanDto {
  @IsInt()
  @Min(1)
  fromInstallmentNumber: number;

  @IsInt()
  @Min(1)
  newTenure: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
