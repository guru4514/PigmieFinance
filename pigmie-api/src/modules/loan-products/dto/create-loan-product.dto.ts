import { IsString, IsEnum, IsNumber, IsPositive, IsInt, Min, IsOptional } from 'class-validator';
import { InterestType, CollectionFrequency, LateFeeType } from '@prisma/client';

export class CreateLoanProductDto {
  @IsString() name: string;
  @IsEnum(InterestType) interestType: InterestType;
  @IsNumber() @Min(0) interestRateAnnual: number;
  @IsEnum(CollectionFrequency) collectionFrequency: CollectionFrequency;
  @IsNumber() @Min(0) minAmount: number;
  @IsNumber() @IsPositive() maxAmount: number;
  @IsInt() @Min(1) minTenure: number;
  @IsInt() @Min(1) maxTenure: number;
  @IsOptional() @IsEnum(LateFeeType) lateFeeType?: LateFeeType;
  @IsOptional() @IsNumber() @Min(0) lateFeeValue?: number;
  @IsOptional() @IsNumber() @Min(0) processingFee?: number;
}
