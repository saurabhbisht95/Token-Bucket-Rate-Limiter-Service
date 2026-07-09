import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // We keep this optional now because admin auth will use hashed DB keys.
  ADMIN_API_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().optional(),

  CONFIG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
