import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Loads .env.local into the test process so API tests can reach the same database as the app.
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 20000,
    fileParallelism: false,
  },
}));
