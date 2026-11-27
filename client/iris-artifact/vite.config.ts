/* Builds the Iris artifact: one self-contained HTML page (dist-iris/iris.html) with the app's CSS
   and JS inline, every image it uses as a data: URI, and React loaded from cdnjs. Run with
   `npm run build:iris`. */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.resolve(here, '..');
const PUBLIC_DIRS = [path.join(client, 'public'), path.resolve(client, '../server/public')];
const OUT_DIR = path.join(client, 'dist-iris');
const OUT_FILE = 'iris.html';
const CACHE_DIR = path.join(client, 'node_modules/.cache/iris-artifact');
const REACT_VERSION = '18.3.1';
const TITLE = 'Iris for Workplace';

const MIME: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** "/iris/add.svg" etc. as written in the source, in quotes, backticks or url(). */
const PUBLIC_PATH = /(?<=["'`(])\/(?:(?:iris|home|nav|admin)\/[\w.-]+|floorplan)\.(?:svg|png|jpe?g|webp|gif)(?=["'`)])/g;

const uris = new Map<string, string | null>();

/** A public file as a data: URI. Photos over 60 KB are scaled to 720px first (macOS `sips`), if that's smaller. */
function dataUri(publicPath: string): string | null {
  if (uris.has(publicPath)) return uris.get(publicPath)!;
  const rel = publicPath.replace(/^\//, '');
  const file = PUBLIC_DIRS.map((dir) => path.join(dir, rel)).find((f) => existsSync(f));
  let uri: string | null = null;
  if (file) {
    const ext = path.extname(file).slice(1).toLowerCase();
    let source = file;
    if ((ext === 'jpg' || ext === 'jpeg') && statSync(file).size > 60_000) {
      const scaled = path.join(CACHE_DIR, rel.replace(/\//g, '__'));
      if (!existsSync(scaled)) {
        mkdirSync(CACHE_DIR, { recursive: true });
        try {
          execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '62', '-Z', '720', file, '--out', scaled], { stdio: 'ignore' });
        } catch {
          // No sips (not macOS): the original goes in.
        }
      }
      if (existsSync(scaled) && statSync(scaled).size < statSync(file).size) source = scaled;
    }
    uri = `data:${MIME[ext]};base64,${readFileSync(source).toString('base64')}`;
  }
  uris.set(publicPath, uri);
  return uri;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/**
 * Images looked up by name at run time, through asset() (`/home/${file}`) or NavBar's navAsset()
 * (`/nav/${file}`): every nav icon, every photo named in the seed data, and every asset('…') call.
 */
function runtimeAssets(): string[] {
  const nav = readdirSync(path.join(client, 'public/nav')).map((f) => `/nav/${f}`);
  const seed = readFileSync(path.resolve(client, '../server/src/data/seed.ts'), 'utf8');
  const named = [...seed.matchAll(/(?:photo|image): '([\w.-]+\.(?:jpe?g|png|svg))'/g)].map((m) => m[1]);
  const code = [path.join(client, 'src/features/iris'), path.join(client, 'src/features/booking'), here].flatMap(walk).filter((f) => /\.tsx?$/.test(f));
  const called = code.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/asset\('([\w.-]+)'\)/g)].map((m) => m[1]));
  return [...nav, ...[...new Set([...named, ...called])].map((f) => `/home/${f}`)];
}

function inlinePublicAssets(): Plugin {
  const VIRTUAL = '\0iris-assets';
  return {
    name: 'iris-inline-public-assets',
    enforce: 'pre',
    resolveId: (id) => (id === 'virtual:iris-assets' ? VIRTUAL : null),
    load(id) {
      if (id !== VIRTUAL) return null;
      const map = Object.fromEntries(runtimeAssets().flatMap((p) => (dataUri(p) ? [[p, dataUri(p)]] : [])));
      return `export const IRIS_ASSETS = ${JSON.stringify(map)};`;
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.(tsx?|css)$/.test(file)) return null;
      let out = code.replace(PUBLIC_PATH, (p) => {
        const uri = dataUri(p);
        if (!uri) this.warn(`No public file for ${p}`);
        return uri ?? p;
      });
      if (/features[\\/](home[\\/]asset\.ts|booking[\\/]NavBar\.tsx)$/.test(file)) {
        out = `import { IRIS_ASSETS } from 'virtual:iris-assets';\n${out.replace(
          /`\/(home|nav)\/\$\{(\w+)\}`/g,
          (_, dir: string, name: string) => `(IRIS_ASSETS['/${dir}/' + ${name}] ?? '/${dir}/' + ${name})`,
        )}`;
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

/** Folds the built JS and CSS into one HTML page in the artifact format (no html/head/body tags). */
function singleFile(): Plugin {
  return {
    name: 'iris-single-file',
    apply: 'build',
    closeBundle() {
      const files = readdirSync(OUT_DIR);
      const read = (ext: string) => files.filter((f) => f.endsWith(ext)).map((f) => readFileSync(path.join(OUT_DIR, f), 'utf8')).join('\n');
      const js = read('.js').replace(/<\/script/gi, '<\\/script');
      const css = read('.css').replace(/<\/style/gi, '<\\/style');
      const cdn = (lib: string, file: string) => `<script src="https://cdnjs.cloudflare.com/ajax/libs/${lib}/${REACT_VERSION}/umd/${file}" crossorigin="anonymous"></script>`;
      const html = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        `<title>${TITLE}</title>`,
        `<style>${css}</style>`,
        '<div id="root"></div>',
        cdn('react', 'react.production.min.js'),
        cdn('react-dom', 'react-dom.production.min.js'),
        `<script>${js}</script>`,
        '',
      ].join('\n');
      for (const f of files) rmSync(path.join(OUT_DIR, f), { recursive: true });
      writeFileSync(path.join(OUT_DIR, OUT_FILE), html);
      console.log(`\n${path.relative(client, path.join(OUT_DIR, OUT_FILE))}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
    },
  };
}

export default defineConfig({
  root: client,
  publicDir: false,
  plugins: [inlinePublicAssets(), react(), singleFile()],
  resolve: {
    // React comes from the cdnjs UMD globals, which have no JSX runtime of their own.
    alias: { 'react/jsx-runtime': path.join(here, 'jsx-runtime.ts') },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.join(here, 'main.tsx'),
      formats: ['iife'],
      name: 'IrisArtifact',
      fileName: () => 'iris.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
        interop: 'auto',
      },
    },
  },
});
