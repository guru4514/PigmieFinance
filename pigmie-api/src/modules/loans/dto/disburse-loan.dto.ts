import { IsDateString } from 'class-validator';

export class DisburseLoanDto {
  @IsDateString() startDate: string;
}
