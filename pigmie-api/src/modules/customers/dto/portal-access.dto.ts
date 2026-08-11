import { IsEmail, IsString } from 'class-validator';

export class PortalAccessDto {
  @IsEmail() email: string;
}
