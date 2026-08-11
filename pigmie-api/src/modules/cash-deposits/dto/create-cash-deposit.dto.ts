import { IsNumber, IsDateString, IsOptional, IsString, Min } from 'class-validator';

export class CreateCashDepositDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsDateString()
  depositDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
