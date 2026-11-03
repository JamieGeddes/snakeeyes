import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Webcam access needs a secure context; localhost counts as one.
    host: 'localhost',
  },
  build: {
    rolldownOptions: {
      // Paths are relative to the project root.
      input: {
        main: 'index.html',
        tracking: 'tracking.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
