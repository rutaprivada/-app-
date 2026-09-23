const fs = require('fs');
const path = require('path');

const srcChoferJpg = 'C:\\Users\\daniel\\.gemini\\antigravity-ide\\brain\\74630162-6221-4fb8-ab2f-5ac43b640c3c\\icon_chofer_1790189979209.jpg';
const destChoferPng = path.join(__dirname, 'icon_chofer.png');
const srcPasajero = path.join(__dirname, 'icon-512.png');
const destPasajero = path.join(__dirname, 'icon_pasajero.png');

if (fs.existsSync(srcChoferJpg)) {
    fs.copyFileSync(srcChoferJpg, destChoferPng);
    console.log('icon_chofer.png guardado con exito.');
}

if (fs.existsSync(srcPasajero)) {
    fs.copyFileSync(srcPasajero, destPasajero);
    console.log('icon_pasajero.png guardado con exito.');
}
