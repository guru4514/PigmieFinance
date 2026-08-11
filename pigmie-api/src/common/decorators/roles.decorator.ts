import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '../types/request-user.type';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
