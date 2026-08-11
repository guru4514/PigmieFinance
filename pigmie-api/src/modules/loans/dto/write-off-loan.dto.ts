import { IsString, IsNotEmpty } from 'class-validator';

export class WriteOffLoanDto {
  @IsString() @IsNotEmpty() reason: string;
}
