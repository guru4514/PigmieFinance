import { IsNumber, IsPositive, IsInt, Min, IsUUID, IsOptional, IsString } from 'class-validator';

export class CreateLoanDto {
  @IsUUID() customerId: string;
  @IsUUID() loanProductId: string;
  @IsNumber() @IsPositive() principalAmount: number;
  @IsInt() @Min(1) tenure: number;
  @IsOptional() @IsString() notes?: string;
}
