// Build: bundles the game into dist/ and a single self-contained HTML file.
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const serve = process.argv.includes('--serve');
const opts = {
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: !serve, sourcemap: serve,
  outdir: 'dist', target: ['es2020'], legalComments: 'none', logLevel: 'info',
};
const tpl = fs.readFileSync('src/index.html', 'utf8');
fs.mkdirSync('dist', { recursive: true });

function writeHtml() {
  fs.writeFileSync('dist/index.html', tpl.replace('<!--CSS-->', '<link rel="stylesheet" href="main.css">').replace('<!--JS-->', '<script src="main.js"></script>'));
}

if (serve) {
  writeHtml();
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 8000 });
  console.log(`Dev server: http://localhost:${port}`);
} else {
  await esbuild.build(opts);
  writeHtml();
  const css = fs.readFileSync('dist/main.css', 'utf8');
  const js = fs.readFileSync('dist/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  const single = tpl.replace('<!--CSS-->', () => `<style>${css}</style>`).replace('<!--JS-->', () => `<script>${js}</script>`);
  fs.writeFileSync('dist/Gridiron27.html', single);
  fs.copyFileSync('dist/Gridiron27.html', 'Gridiron27.html');
  console.log(`Built dist/ and Gridiron27.html (${(single.length / 1024).toFixed(0)} KB)`);
}
