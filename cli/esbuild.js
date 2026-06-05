// @ts-check
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/index.ts'],
  bundle: true,                 // bundle the shared core in — no runtime dep
  outfile: 'dist/cli.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  minify: false,
  banner: { js: '#!/usr/bin/env node' },
};

if (watch) {
  esbuild.context(config).then(ctx => ctx.watch()).catch(() => process.exit(1));
} else {
  esbuild.build(config).catch(() => process.exit(1));
}
