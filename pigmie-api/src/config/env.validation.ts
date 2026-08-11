import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PII_ENCRYPTION_KEY: z.string().length(64).regex(/^[a-fA-F0-9]+$/),
  CORS_ORIGIN: z.string().default('*'),
  PORT: z.coerce.number().default(3000),
});

export function validate(config: Record<string, unknown>) {
  const parsed = envSchema.parse(config);
  return parsed;
}
