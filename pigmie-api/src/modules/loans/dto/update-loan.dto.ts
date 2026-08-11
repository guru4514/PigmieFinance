import { IsString, IsNumber, IsPositive, IsInt, Min, IsOptional } from 'class-validator';

export class UpdateLoanDto {
  @IsOptional() @IsNumber() @IsPositive() principalAmount?: number;
  @IsOptional() @IsInt() @Min(1) tenure?: number;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() guarantorName?: string;
  @IsOptional() @IsString() guarantorPhone?: string;
  @IsOptional() @IsString() guarantorIdProofType?: string;
  @IsOptional() @IsString() guarantorIdProofNumber?: string;
}
