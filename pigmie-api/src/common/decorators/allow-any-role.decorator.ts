import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANY_ROLE_KEY = 'allowAnyRole';
export const AllowAnyRole = () => SetMetadata(ALLOW_ANY_ROLE_KEY, true);
