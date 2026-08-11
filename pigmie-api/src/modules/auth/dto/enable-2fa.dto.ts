import { IsString, Length } from 'class-validator';

export class Enable2FADto {
  @IsString()
  @Length(6, 6)
  code: string;
}
