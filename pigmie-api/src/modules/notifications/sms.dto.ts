import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class SendSmsDto {
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone: string;

  @IsString()
  @Length(1, 1600)
  message: string;
}

export class BulkSmsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SendSmsDto)
  recipients: SendSmsDto[];
}
