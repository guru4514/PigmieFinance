import { IsOptional, IsString } from 'class-validator';

export class ReviewApprovalDto {
  @IsString()
  @IsOptional()
  reviewNote?: string;
}
