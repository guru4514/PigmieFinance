import {
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateLoanDto {
  @IsUUID() customerId: string;
  @IsUUID() loanProductId: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  principalAmount: number;
  @IsInt() @Min(1) @Max(10000) tenure: number;
  @IsOptional() @IsString() notes?: string;
}
