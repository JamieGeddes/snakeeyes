import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Webcam access needs a secure context; localhost counts as one.
    host: 'localhost',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
