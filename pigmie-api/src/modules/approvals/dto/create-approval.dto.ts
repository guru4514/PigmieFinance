import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateApprovalDto {
  @IsEnum(['delete_customer', 'reverse_collection', 'close_loan', 'write_off_loan', 'restructure_loan'])
  @IsNotEmpty()
  actionType: string;

  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

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
