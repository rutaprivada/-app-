const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'pasajero'; // 'pasajero' or 'conductor'
const targetDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');
const androidBuildDir = path.join(__dirname, 'android', 'app', 'build');

console.log(`==========================================`);
console.log(` Preparando archivos para App (${mode.toUpperCase()})`);
console.log(`==========================================`);

// Clean assets directory to remove previous app files
if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// Clean Android build folder to force fresh compilation
if (fs.existsSync(androidBuildDir)) {
    try {
        fs.rmSync(androidBuildDir, { recursive: true, force: true });
        console.log(` Limpiada la cache de compilacion anterior (android/app/build).`);
    } catch (e) {
        console.log(` Nota: No se pudo borrar android/app/build directamente (si Android Studio lo esta usando).`);
    }
}

// List of extensions to copy
const allowedExtensions = ['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.json', '.webp', '.ico'];

// Files to copy
const files = fs.readdirSync(__dirname);

files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(__dirname, file);

    if (fs.statSync(fullPath).isFile() && allowedExtensions.includes(ext) && !file.startsWith('capacitor') && !file.startsWith('package')) {
        const destPath = path.join(targetDir, file);
        fs.copyFileSync(fullPath, destPath);
    }
});

// Configure entry point (index.html)
if (mode === 'conductor') {
    const conductorPath = path.join(__dirname, 'conductor.html');
    const destIndexPath = path.join(targetDir, 'index.html');
    fs.copyFileSync(conductorPath, destIndexPath);
    console.log(` Entrypoint configurado: APP CONDUCTOR (conductor.html -> index.html)`);
} else {
    const passengerPath = path.join(__dirname, 'index.html');
    const destIndexPath = path.join(targetDir, 'index.html');
    fs.copyFileSync(passengerPath, destIndexPath);
    console.log(` Entrypoint configurado: APP PASAJERO (index.html -> index.html)`);
}

console.log(`\n Archivos preparados exitosamente en:`);
console.log(` ${targetDir}`);
console.log(`==========================================\n`);
