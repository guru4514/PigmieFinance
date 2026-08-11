import { IsUUID, IsNumber, IsPositive, IsDateString, IsEnum, IsOptional, IsString, IsLatitude, IsLongitude, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum CollectionMethodEnum {
  cash = 'cash',
  cheque = 'cheque',
  other = 'other',
}

export class CreateCollectionDto {
  @IsUUID()
  clientGeneratedId: string;

  @IsUUID()
  loanId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDateString()
  collectionDate: string;

  @IsDateString()
  collectedAt: string;

  @IsEnum(CollectionMethodEnum)
  collectionMethod: CollectionMethodEnum;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SyncCollectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCollectionDto)
  collections: CreateCollectionDto[];
}

export class ReverseCollectionDto {
  @IsString()
  reason: string;
}

export class QueryCollectionDto {
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
