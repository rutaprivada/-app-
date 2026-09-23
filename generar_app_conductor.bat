@echo off
title RutaPrivada - Generar App Conductor (APK)
cd /d "%~dp0"
echo =======================================================
echo   RutaPrivada - Preparando App Conductor para Android
echo =======================================================
echo.
echo 1. Instalando librerias de Capacitor...
if exist "C:\Program Files\nodejs\npm.cmd" (
    call "C:\Program Files\nodejs\npm.cmd" install
) else (
    call npm install
)

echo.
echo 2. Sincronizando plataforma Android Conductor...
if exist "C:\Program Files\nodejs\npx.cmd" (
    call "C:\Program Files\nodejs\npx.cmd" cap add android
    call "C:\Program Files\nodejs\npx.cmd" cap copy android --config capacitor.driver.json
    echo.
    echo 3. Abriendo Android Studio...
    call "C:\Program Files\nodejs\npx.cmd" cap open android
) else (
    call npx cap add android
    call npx cap copy android --config capacitor.driver.json
    echo.
    echo 3. Abriendo Android Studio...
    call npx cap open android
)

echo.
echo =======================================================
echo   Proceso finalizado. En Android Studio ve a:
echo   Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo =======================================================
pause
