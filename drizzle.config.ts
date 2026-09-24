import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está configurada');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/*-schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  schemaFilter: ['public'],
  verbose: true,
});
