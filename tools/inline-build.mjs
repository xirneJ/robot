import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const distHtmlPath = path.join(distDir, 'src', 'index.html');
let html = fs.readFileSync(distHtmlPath, 'utf8');

html = html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href) => {
  const file = path.resolve(path.dirname(distHtmlPath), href);
  return `<style>\n${fs.readFileSync(file, 'utf8')}\n</style>`;
});

html = html.replace(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const file = path.resolve(path.dirname(distHtmlPath), src);
  return `<script type="module">\n${fs.readFileSync(file, 'utf8')}\n</script>`;
});

html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '');
const externalAssets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
if (externalAssets.length) throw new Error(`External assets remain: ${externalAssets.join(', ')}`);

fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log(`Wrote ${path.join(root, 'index.html')} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);