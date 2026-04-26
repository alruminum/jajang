import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'node',
    typecheck: { tsconfig: './tsconfig.test.json' },
    setupFiles: ['./src/__tests__/setup.ts'],
    server: {
      deps: {
        inline: ['@testing-library/react-native'],
      },
    },
    alias: {
      '@screens': path.resolve(__dirname, './src/screens'),
      '@components': path.resolve(__dirname, './src/components'),
      '@store/index': path.resolve(__dirname, './src/store/index.ts'),
      '@store': path.resolve(__dirname, './src/store'),
      '@services': path.resolve(__dirname, './src/services'),
      '@audio': path.resolve(__dirname, './src/audio'),
      '@navigation': path.resolve(__dirname, './src/navigation'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
