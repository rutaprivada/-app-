const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const targets = [
  path.join(__dirname, 'www_pasajero'),
  path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public')
];

const filesToSync = [
  'index.html',
  'styles.css',
  'app.js',
  'sync.js',
  'sw.js',
  'manifest.json',
  'favicon.svg',
  'logo_rutaprivada.svg'
];

targets.forEach(targetDir => {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  filesToSync.forEach(file => {
    const src = path.join(srcDir, file);
    const dst = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`Copied ${file} -> ${path.relative(__dirname, dst)}`);
    }
  });
});
console.log('Sync completed successfully.');
