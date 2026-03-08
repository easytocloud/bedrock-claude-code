// @ts-check
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],   // provided by the extension host at runtime
  format: 'cjs',          // VS Code extension host requires CommonJS
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
};

if (watch) {
  esbuild.context(config).then(ctx => ctx.watch()).catch(() => process.exit(1));
} else {
  esbuild.build(config).catch(() => process.exit(1));
}
