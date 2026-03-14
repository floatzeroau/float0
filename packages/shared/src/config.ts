/**
 * Typed config loader that validates required environment variables at startup.
 */

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  corsOrigins: string[];
  mailersendApiKey: string;
  sentryDsn: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function getConfig(): AppConfig {
  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret: requireEnv('JWT_SECRET'),
    port: Number(optionalEnv('PORT', '4000')),
    corsOrigins: optionalEnv('CORS_ORIGINS', '').split(',').filter(Boolean),
    mailersendApiKey: optionalEnv('MAILERSEND_API_KEY', ''),
    sentryDsn: optionalEnv('SENTRY_DSN', ''),
  };
}
