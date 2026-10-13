import { z } from 'zod';

const envSchema = z.object({
  RUNTIME_DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PII_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[a-fA-F0-9]+$/),
  CORS_ORIGIN: z.string().default('*'),
  PORT: z.coerce.number().default(3000),
});

export function validate(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success)
    throw new Error('Application configuration is incomplete or invalid');
  return parsed.data;
}
