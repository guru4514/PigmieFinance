import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNPROVISIONED_KEY = 'allowUnprovisioned';
export const AllowUnprovisioned = () => SetMetadata(ALLOW_UNPROVISIONED_KEY, true);
