import { IsString, Length, IsOptional, IsUUID } from 'class-validator';

export class Disable2FADto {
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}
