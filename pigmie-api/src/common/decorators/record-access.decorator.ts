import { SetMetadata } from '@nestjs/common';

export const RECORD_ACCESS_KEY = 'record-access';
export interface RecordAccessRule {
  resource: 'customer' | 'loan' | 'collection';
  source?: 'params' | 'body' | 'collections';
  field?: string;
  allowRecordedRetry?: boolean;
}
export const RecordAccess = (rule: RecordAccessRule) =>
  SetMetadata(RECORD_ACCESS_KEY, rule);
