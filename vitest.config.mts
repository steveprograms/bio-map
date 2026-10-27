import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Unit tests are *.test.ts(x); Playwright's end-to-end tests in e2e/ are run separately
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'e2e/**', '.next/**'],
  },
});
