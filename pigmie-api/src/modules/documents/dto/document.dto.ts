import { IsString, IsEnum, IsUUID, IsOptional, IsNumber } from 'class-validator';

export enum DocumentRelatedTypeEnum {
  customer = 'customer',
  loan = 'loan',
  collection = 'collection',
}

export class RequestUploadUrlDto {
  @IsEnum(DocumentRelatedTypeEnum)
  relatedEntityType: DocumentRelatedTypeEnum;

  @IsUUID()
  relatedEntityId: string;

  @IsString()
  documentType: string;

  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  fileSizeBytes?: number;
}

export class RegisterDocumentDto {
  @IsEnum(DocumentRelatedTypeEnum)
  relatedEntityType: DocumentRelatedTypeEnum;

  @IsUUID()
  relatedEntityId: string;

  @IsString()
  documentType: string;

  @IsString()
  filePath: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  fileSizeBytes?: number;
}
