const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');
const stringsXml = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');

// Detectar si el proyecto Android está configurado para Chofer o Pasajero
let isDriverMode = false;
if (fs.existsSync(stringsXml)) {
  const content = fs.readFileSync(stringsXml, 'utf8');
  if (content.toLowerCase().includes('chofer') || content.toLowerCase().includes('conductor')) {
    isDriverMode = true;
  }
}

const filesToSync = [
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
  'manifest-driver.json',
  'sw.js',
  'partners.html',
  'privacidad.html',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon_chofer.png',
  'icon_pasajero.png'
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

  // Copiar el archivo principal adecuado a index.html según el modo activo
  if (isDriverMode) {
    fs.copyFileSync(path.join(__dirname, 'conductor.html'), path.join(publicDir, 'index.html'));
    console.log('Synced: conductor.html -> android index.html (Modo CHOFER)');
  } else {
    fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(publicDir, 'index.html'));
    console.log('Synced: index.html -> android index.html (Modo PASAJERO)');
  }

  console.log('All public assets successfully synchronized.');
}

