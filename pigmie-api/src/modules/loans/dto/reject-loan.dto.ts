import { IsString, IsNotEmpty } from 'class-validator';

export class RejectLoanDto {
  @IsString() @IsNotEmpty() reason: string;
}
