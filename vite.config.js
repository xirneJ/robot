import path from 'node:path';

const threeRoot = 'E:/root/e-era-nav/node_modules/three';
export default {
  base: './',
  resolve: {
    alias: [
      { find: /^three\/webgpu$/, replacement: path.join(threeRoot, 'build/three.webgpu.js') },
      { find: /^three\/tsl$/, replacement: path.join(threeRoot, 'build/three.tsl.js') },
      { find: /^three$/,  replacement: path.join(threeRoot, 'build/three.module.js') },
      { find: /^three\/addons\//, replacement: path.join(threeRoot, 'examples/jsm/') + '/' }
    ]
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(process.cwd(), 'src/index.html'),
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
};