import { IsEnum, IsOptional, IsString } from 'class-validator';

export class VerifyCashDepositDto {
  @IsEnum(['verified', 'discrepancy'])
  status: 'verified' | 'discrepancy';

  @IsOptional()
  @IsString()
  notes?: string;
}
