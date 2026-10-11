import { SetMetadata } from '@nestjs/common';

export const ALLOW_FIRST_FACTOR_KEY = 'allow_first_factor';
/** Identity bootstrap only; never add this to a business-data or mutation route. */
export const AllowFirstFactor = () => SetMetadata(ALLOW_FIRST_FACTOR_KEY, true);
