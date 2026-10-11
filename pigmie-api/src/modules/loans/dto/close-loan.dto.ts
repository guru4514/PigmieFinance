import { IsNumber, IsOptional, IsPositive, Max } from 'class-validator';

export class CloseLoanDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  preClosureAmount?: number;
}
