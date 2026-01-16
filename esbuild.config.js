const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Separate build configs for different output formats
const backgroundConfig = {
  entryPoints: ['src/background/service-worker.ts'],
  bundle: true,
  outfile: 'dist/service-worker.js',
  format: 'esm',
  target: 'es2020',
  sourcemap: false,
  minify: !isWatch,
};

const contentConfig = {
  entryPoints: ['src/content/linkedin-filter.ts'],
  bundle: true,
  outfile: 'dist/linkedin-filter.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
  minify: !isWatch,
};

const popupConfig = {
  entryPoints: ['src/popup/popup.ts'],
  bundle: true,
  outfile: 'dist/popup.js',
  format: 'esm',
  target: 'es2020',
  sourcemap: false,
  minify: !isWatch,
};

async function copyStaticFiles() {
  const staticFiles = [
    { src: 'src/manifest.json', dest: 'dist/manifest.json' },
    { src: 'src/popup/popup.html', dest: 'dist/popup.html' },
    { src: 'src/popup/popup.css', dest: 'dist/popup.css' },
  ];

  for (const file of staticFiles) {
    if (fs.existsSync(file.src)) {
      fs.copyFileSync(file.src, file.dest);
      console.log(`Copied ${file.src} -> ${file.dest}`);
    }
  }
}

async function build() {
  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  // Build all TypeScript files
  if (isWatch) {
    const [bgCtx, contentCtx, popupCtx] = await Promise.all([
      esbuild.context(backgroundConfig),
      esbuild.context(contentConfig),
      esbuild.context(popupConfig),
    ]);

    await Promise.all([
      bgCtx.watch(),
      contentCtx.watch(),
      popupCtx.watch(),
    ]);

    console.log('Watching for changes...');

    // Also watch static files
    const staticFiles = ['src/manifest.json', 'src/popup/popup.html', 'src/popup/popup.css'];
    for (const file of staticFiles) {
      fs.watchFile(file, () => {
        console.log(`${file} changed, copying...`);
        copyStaticFiles();
      });
    }
  } else {
    await Promise.all([
      esbuild.build(backgroundConfig),
      esbuild.build(contentConfig),
      esbuild.build(popupConfig),
    ]);
    console.log('TypeScript build complete!');
  }

  // Copy static files
  copyStaticFiles();

  console.log('Build complete!');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
