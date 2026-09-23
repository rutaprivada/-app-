const fs = require('fs');
const path = require('path');

const userUploadedDir = 'C:\\Users\\daniel\\.gemini\\antigravity-ide\\brain\\74630162-6221-4fb8-ab2f-5ac43b640c3c\\.user_uploaded';

const fileChofer = path.join(userUploadedDir, 'media_1790190043516.png');
const filePasajero = path.join(userUploadedDir, 'media_1790190074835.png');

const rootChofer = path.join(__dirname, 'icon_chofer.png');
const rootPasajero = path.join(__dirname, 'icon_pasajero.png');

if (fs.existsSync(fileChofer)) {
    fs.copyFileSync(fileChofer, rootChofer);
    console.log('OK: icon_chofer.png actualizado con la imagen subida.');
}

if (fs.existsSync(filePasajero)) {
    fs.copyFileSync(filePasajero, rootPasajero);
    console.log('OK: icon_pasajero.png actualizado con la imagen subida.');
}
