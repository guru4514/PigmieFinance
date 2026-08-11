import { IsString, IsEnum, IsNumber, IsPositive, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';
import { InterestType, CollectionFrequency, LateFeeType } from '@prisma/client';

export class UpdateLoanProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(InterestType) interestType?: InterestType;
  @IsOptional() @IsNumber() @IsPositive() interestRateAnnual?: number;
  @IsOptional() @IsEnum(CollectionFrequency) collectionFrequency?: CollectionFrequency;
  @IsOptional() @IsNumber() @IsPositive() minAmount?: number;
  @IsOptional() @IsNumber() @IsPositive() maxAmount?: number;
  @IsOptional() @IsInt() @Min(1) minTenure?: number;
  @IsOptional() @IsInt() @Min(1) maxTenure?: number;
  @IsOptional() @IsEnum(LateFeeType) lateFeeType?: LateFeeType;
  @IsOptional() @IsNumber() @Min(0) lateFeeValue?: number;
  @IsOptional() @IsNumber() @Min(0) processingFee?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
