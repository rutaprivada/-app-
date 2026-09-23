const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'pasajero'; // 'pasajero' or 'conductor'
const targetDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');
const androidBuildDir = path.join(__dirname, 'android', 'app', 'build');
const buildGradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
const stringsXmlPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');

// 1. Locate and prepare icons from user uploads
const userUploadedDir = 'C:\\Users\\daniel\\.gemini\\antigravity-ide\\brain\\74630162-6221-4fb8-ab2f-5ac43b640c3c\\.user_uploaded';
const fileChoferUploaded = path.join(userUploadedDir, 'media_1790190043516.png');
const filePasajeroUploaded = path.join(userUploadedDir, 'media_1790190074835.png');

const iconChoferPng = path.join(__dirname, 'icon_chofer.png');
const iconPasajeroPng = path.join(__dirname, 'icon_pasajero.png');

if (fs.existsSync(fileChoferUploaded)) {
    try { fs.copyFileSync(fileChoferUploaded, iconChoferPng); } catch(e){}
}

if (fs.existsSync(filePasajeroUploaded)) {
    try { fs.copyFileSync(filePasajeroUploaded, iconPasajeroPng); } catch(e){}
}

console.log(`==========================================`);
console.log(` Sincronizando App Android: [ ${mode.toUpperCase()} ]`);
console.log(`==========================================`);

// 2. Configure applicationId and app_name
let appId = mode === 'conductor' ? 'com.rutaprivada.chofer' : 'com.rutaprivada.pasajero';
let appName = mode === 'conductor' ? 'RutaPrivada Chofer' : 'Ruta Privada';

// Update build.gradle applicationId
if (fs.existsSync(buildGradlePath)) {
    let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
    gradleContent = gradleContent.replace(/applicationId\s+"[^"]+"/, `applicationId "${appId}"`);
    fs.writeFileSync(buildGradlePath, gradleContent, 'utf8');
    console.log(` Package ID: ${appId}`);
}

// Update strings.xml app_name
if (fs.existsSync(stringsXmlPath)) {
    let stringsContent = fs.readFileSync(stringsXmlPath, 'utf8');
    stringsContent = stringsContent.replace(/<string name="app_name">[^<]+<\/string>/, `<string name="app_name">${appName}</string>`);
    stringsContent = stringsContent.replace(/<string name="title_activity_main">[^<]+<\/string>/, `<string name="title_activity_main">${appName}</string>`);
    fs.writeFileSync(stringsXmlPath, stringsContent, 'utf8');
    console.log(` Nombre App: ${appName}`);
}

// 3. Configure Android App Icons (Mipmaps)
let chosenIcon = null;
if (mode === 'conductor') {
    if (fs.existsSync(iconChoferPng)) chosenIcon = iconChoferPng;
    else if (fs.existsSync(fileChoferUploaded)) chosenIcon = fileChoferUploaded;
} else {
    if (fs.existsSync(iconPasajeroPng)) chosenIcon = iconPasajeroPng;
    else if (fs.existsSync(filePasajeroUploaded)) chosenIcon = filePasajeroUploaded;
    else chosenIcon = path.join(__dirname, 'icon-512.png');
}

const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const mipmapFolders = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];

// Clean up any png icons mistakenly copied to mipmap-anydpi-v26 (which causes "Duplicate resources" error in Android Studio)
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
    console.log(` Icono oficial asignado a mipmaps nativos.`);
}

// 4. Clean assets directory
if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// 5. Clean Android build folder to force fresh compilation
if (fs.existsSync(androidBuildDir)) {
    try {
        fs.rmSync(androidBuildDir, { recursive: true, force: true });
        console.log(` Cache de compilacion limpiada.`);
    } catch (e) {}
}

// 6. Copy web files to assets
const allowedExtensions = ['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.json', '.webp', '.ico'];
const files = fs.readdirSync(__dirname);

files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(__dirname, file);

    if (fs.statSync(fullPath).isFile() && allowedExtensions.includes(ext) && !file.startsWith('capacitor') && !file.startsWith('package')) {
        const destPath = path.join(targetDir, file);
        fs.copyFileSync(fullPath, destPath);
    }
});

// 7. Configure entry point (index.html)
if (mode === 'conductor') {
    const conductorPath = path.join(__dirname, 'conductor.html');
    const destIndexPath = path.join(targetDir, 'index.html');
    fs.copyFileSync(conductorPath, destIndexPath);
    console.log(` Entrypoint: conductor.html -> index.html (CHOFER)`);
} else {
    const passengerPath = path.join(__dirname, 'index.html');
    const destIndexPath = path.join(targetDir, 'index.html');
    fs.copyFileSync(passengerPath, destIndexPath);
    console.log(` Entrypoint: index.html -> index.html (PASAJERO)`);
}

console.log(`==========================================`);
console.log(` Sincronizacion finalizada con exito.`);
console.log(`==========================================\n`);
