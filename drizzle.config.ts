import { defineConfig } from 'drizzle-kit';

// Only used to generate SQL migrations; Wrangler applies them to D1.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/db/schema.ts',
  out: './migrations',
});
