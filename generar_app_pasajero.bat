@echo off
title RutaPrivada - Generar App Pasajero (APK)
cd /d "%~dp0"
echo =======================================================
echo   RutaPrivada - Preparando App Pasajero para Android
echo =======================================================
echo.
echo 1. Copiando archivos web al proyecto Android...
if exist "C:\Program Files\nodejs\node.exe" (
    call "C:\Program Files\nodejs\node.exe" preparar_app.js pasajero
) else (
    call node preparar_app.js pasajero
)

echo.
echo 2. Sincronizando recursos con Capacitor...
if exist "C:\Program Files\nodejs\npx.cmd" (
    call "C:\Program Files\nodejs\npx.cmd" cap copy android --config capacitor.passenger.json
    call "C:\Program Files\nodejs\npx.cmd" cap open android --config capacitor.passenger.json
) else (
    call npx cap copy android --config capacitor.passenger.json
    call npx cap open android --config capacitor.passenger.json
)

echo.
echo =======================================================
echo   Proceso finalizado. En Android Studio ve a:
echo   Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo =======================================================
pause
