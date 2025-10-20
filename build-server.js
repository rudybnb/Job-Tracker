import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  await build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: 'dist',
    packages: 'external',
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
    external: ['ws', '@neondatabase/serverless'],
    target: 'node18',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
  });

  console.log('✅ Server build completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}