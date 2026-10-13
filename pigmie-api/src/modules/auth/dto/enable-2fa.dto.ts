import { IsString, Length, Matches } from 'class-validator';

export class Enable2FADto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Code must contain exactly six digits' })
  code: string;
}
