const fs = require('fs');
const path = require('path');

const userUploadedDir = 'C:\\Users\\daniel\\.gemini\\antigravity-ide\\brain\\74630162-6221-4fb8-ab2f-5ac43b640c3c\\.user_uploaded';

// The two newest images uploaded by the user
const file1 = path.join(userUploadedDir, 'media_1790190043516.png');
const file2 = path.join(userUploadedDir, 'media_1790190074835.png');

const targetChofer = path.join(__dirname, 'icon_chofer.png');
const targetPasajero = path.join(__dirname, 'icon_pasajero.png');

if (fs.existsSync(file1)) {
    fs.copyFileSync(file1, targetChofer);
    console.log('Icono oficial Chofer guardado como icon_chofer.png');
}

if (fs.existsSync(file2)) {
    fs.copyFileSync(file2, targetPasajero);
    console.log('Icono oficial Pasajero guardado como icon_pasajero.png');
}
