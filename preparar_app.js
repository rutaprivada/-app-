const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'pasajero'; // 'pasajero' or 'conductor'
const targetDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

console.log(`==========================================`);
console.log(` Preparando archivos para App (${mode.toUpperCase()})`);
console.log(`==========================================`);

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// List of extensions to copy
const allowedExtensions = ['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.json', '.webp', '.ico'];

// Files to copy
const files = fs.readdirSync(__dirname);

files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(__dirname, file);

    // Don't copy package-lock, package.json, capacitor config files, node_modules or directories
    if (fs.statSync(fullPath).isFile() && allowedExtensions.includes(ext) && !file.startsWith('capacitor') && !file.startsWith('package')) {
        const destPath = path.join(targetDir, file);
        fs.copyFileSync(fullPath, destPath);
        console.log(` Copiado: ${file}`);
    }
});

// Configure entry point (index.html)
if (mode === 'conductor') {
    const conductorPath = path.join(__dirname, 'conductor.html');
    const destIndexPath = path.join(targetDir, 'index.html');
    fs.copyFileSync(conductorPath, destIndexPath);
    console.log(` Set index.html -> conductor.html (App Conductor)`);
} else {
    const passengerPath = path.join(__dirname, 'index.html');
    const destIndexPath = path.join(targetDir, 'index.html');
    fs.copyFileSync(passengerPath, destIndexPath);
    console.log(` Set index.html -> index.html (App Pasajero)`);
}

console.log(`\n Archivos preparados exitosamente en:`);
console.log(` ${targetDir}`);
console.log(`==========================================\n`);
