const fs = require('fs');
const path = require('path');

const mode = (process.argv[2] || 'pasajero').toLowerCase(); // 'pasajero' or 'conductor'
const isConductor = mode === 'conductor';

// Directorios web de distribución según perfil
const distFolder = isConductor ? 'www_conductor' : 'www_pasajero';
const distDir = path.join(__dirname, distFolder);
const targetDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');
const androidBuildDir = path.join(__dirname, 'android', 'app', 'build');
const buildGradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
const stringsXmlPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');

// 1. Preparación de íconos oficiales (rutas relativas al proyecto)
const iconChoferPng = path.join(__dirname, 'icon_chofer.png');
const iconPasajeroPng = path.join(__dirname, 'icon_pasajero.png');
const iconChoferPadded = path.join(__dirname, 'icon_chofer_padded.png');
const iconPasajeroPadded = path.join(__dirname, 'icon_pasajero_padded.png');

console.log(`==========================================`);
console.log(` Sincronizando App Android: [ ${mode.toUpperCase()} ]`);
console.log(` Carpeta WebDir: ${distFolder}`);
console.log(`==========================================`);

// 2. Configurar applicationId y app_name en Android
let appId = isConductor ? 'com.rutaprivada.chofer' : 'com.rutaprivada.pasajero';
let appName = isConductor ? 'RutaPrivada Chofer' : 'Ruta Privada';

// Update build.gradle applicationId
if (fs.existsSync(buildGradlePath)) {
    let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
    gradleContent = gradleContent.replace(/applicationId\s+"[^"]+"/, `applicationId "${appId}"`);
    fs.writeFileSync(buildGradlePath, gradleContent, 'utf8');
    console.log(` Package ID: ${appId}`);
}

// Update strings.xml app_name and package identifiers
if (fs.existsSync(stringsXmlPath)) {
    let stringsContent = fs.readFileSync(stringsXmlPath, 'utf8');
    stringsContent = stringsContent.replace(/<string name="app_name">[^<]+<\/string>/, `<string name="app_name">${appName}</string>`);
    stringsContent = stringsContent.replace(/<string name="title_activity_main">[^<]+<\/string>/, `<string name="title_activity_main">${appName}</string>`);
    stringsContent = stringsContent.replace(/<string name="package_name">[^<]+<\/string>/, `<string name="package_name">${appId}</string>`);
    stringsContent = stringsContent.replace(/<string name="custom_url_scheme">[^<]+<\/string>/, `<string name="custom_url_scheme">${appId}</string>`);
    fs.writeFileSync(stringsXmlPath, stringsContent, 'utf8');
    console.log(` Nombre App: ${appName} | Scheme: ${appId}`);
}

// 3. Sincronizar capacitor.config.json con el perfil correspondiente
const capacitorProfilePath = isConductor
    ? path.join(__dirname, 'capacitor.driver.json')
    : path.join(__dirname, 'capacitor.passenger.json');
const capacitorDestPath = path.join(__dirname, 'capacitor.config.json');

if (fs.existsSync(capacitorProfilePath)) {
    try {
        fs.copyFileSync(capacitorProfilePath, capacitorDestPath);
        console.log(` Capacitor Config: [${path.basename(capacitorProfilePath)}] -> capacitor.config.json`);
    } catch(e) {}
}

// 4. Generar íconos padded si existe el script de PowerShell
const psScript = path.join(__dirname, 'generar_iconos_padded.ps1');
if (fs.existsSync(psScript)) {
    try {
        const { execSync } = require('child_process');
        execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'ignore' });
    } catch(e){}
}

let chosenIcon = null;
if (isConductor) {
    if (fs.existsSync(iconChoferPadded)) chosenIcon = iconChoferPadded;
    else if (fs.existsSync(iconChoferPng)) chosenIcon = iconChoferPng;
} else {
    if (fs.existsSync(iconPasajeroPadded)) chosenIcon = iconPasajeroPadded;
    else if (fs.existsSync(iconPasajeroPng)) chosenIcon = iconPasajeroPng;
    else if (fs.existsSync(path.join(__dirname, 'icon-512.png'))) chosenIcon = path.join(__dirname, 'icon-512.png');
}

const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const mipmapFolders = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];

// Limpiar PNGs duplicados en mipmap-anydpi-v26
const anydpiDir = path.join(resDir, 'mipmap-anydpi-v26');
if (fs.existsSync(anydpiDir)) {
    ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].forEach(pngFile => {
        const fullPngPath = path.join(anydpiDir, pngFile);
        if (fs.existsSync(fullPngPath)) {
            try { fs.unlinkSync(fullPngPath); } catch(e){}
        }
    });
}

if (chosenIcon && fs.existsSync(chosenIcon) && fs.existsSync(resDir)) {
    mipmapFolders.forEach(folder => {
        const folderPath = path.join(resDir, folder);
        if (fs.existsSync(folderPath)) {
            ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].forEach(iconName => {
                try {
                    fs.copyFileSync(chosenIcon, path.join(folderPath, iconName));
                } catch(e){}
            });
        }
    });
    console.log(` Ícono oficial aplicado a recursos Android mipmap.`);
}

// 5. Limpiar y recrear carpetas de salida
[distDir, targetDir].forEach(dir => {
    if (fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e){}
    }
    fs.mkdirSync(dir, { recursive: true });
});

// Limpiar cache de Gradle si existe
if (fs.existsSync(androidBuildDir)) {
    try {
        fs.rmSync(androidBuildDir, { recursive: true, force: true });
        console.log(` Cache de compilacion de Android limpiada.`);
    } catch (e) {}
}

// 6. Lista de archivos compartidos (recursos estáticos)
const commonAssets = [
    'sync.js',
    'sw.js',
    'favicon.svg',
    'icon-192.png',
    'icon-512.png',
    'logo_rutaprivada.svg',
    'logo_chofer.svg',
    'logo_tarjeta.svg',
    'privacidad.html'
];

// Helper para copiar a ambas carpetas (distDir y targetDir)
function copyToDestinations(srcFilename, destFilename = null) {
    const srcPath = path.join(__dirname, srcFilename);
    const finalName = destFilename || srcFilename;
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(distDir, finalName));
        fs.copyFileSync(srcPath, path.join(targetDir, finalName));
    }
}

// Copiar recursos comunes
commonAssets.forEach(file => copyToDestinations(file));

// 7. Empaquetar según el rol (Chofer vs Pasajero)
if (isConductor) {
    // Para el Chofer: conductor.html pasa a ser el index.html principal
    copyToDestinations('conductor.html', 'index.html');
    copyToDestinations('conductor.html'); // Mantener copia por compatibilidad
    copyToDestinations('conductor.js');
    copyToDestinations('conductor.css');
    copyToDestinations('manifest-driver.json', 'manifest.json');
    copyToDestinations('manifest-driver.json');
    copyToDestinations('agenda.html');
    copyToDestinations('agenda.js');
    copyToDestinations('agenda.css');
    if (fs.existsSync(iconChoferPng)) copyToDestinations('icon_chofer.png');
    if (fs.existsSync(iconChoferPadded)) copyToDestinations('icon_chofer_padded.png');
    console.log(` Entrypoint generado: conductor.html -> [${distFolder}/index.html] (CHOFER)`);
} else {
    // Para el Pasajero: index.html se mantiene como index.html
    copyToDestinations('index.html');
    copyToDestinations('app.js');
    copyToDestinations('styles.css');
    copyToDestinations('manifest.json');
    if (fs.existsSync(iconPasajeroPng)) copyToDestinations('icon_pasajero.png');
    if (fs.existsSync(iconPasajeroPadded)) copyToDestinations('icon_pasajero_padded.png');
    console.log(` Entrypoint generado: index.html -> [${distFolder}/index.html] (PASAJERO)`);
}

console.log(`==========================================`);
console.log(` Sincronizacion finalizada con exito.`);
console.log(` Archivos listos en: ${distFolder} y assets/public`);
console.log(`==========================================\n`);
