import { IsString, Length, IsOptional, IsUUID, Matches } from 'class-validator';

export class Disable2FADto {
  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Code must contain exactly six digits' })
  code?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}
