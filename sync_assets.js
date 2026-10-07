const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

const filesToSync = [
  'index.html',
  'app.js',
  'conductor.html',
  'conductor.js',
  'styles.css',
  'conductor.css',
  'admin.html',
  'sync.js',
  'agenda.html',
  'agenda.js',
  'agenda.css',
  'manifest.json',
  'manifest-driver.json'
];

if (fs.existsSync(publicDir)) {
  filesToSync.forEach(f => {
    const src = path.join(__dirname, f);
    const dest = path.join(publicDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Synced: ${f} -> android assets`);
    }
  });
  console.log('All public assets successfully synchronized.');
}
