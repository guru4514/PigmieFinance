import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApprovalActionType, Prisma } from '@prisma/client';

export class CreateApprovalDto {
  @IsEnum(ApprovalActionType)
  @IsNotEmpty()
  actionType: ApprovalActionType;

  @IsObject()
  @IsNotEmpty()
  payload: Prisma.InputJsonObject;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsUUID()
  @IsNotEmpty()
  entityId: string;
}
