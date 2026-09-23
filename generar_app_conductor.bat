@echo off
title RutaPrivada - Generar App Conductor (APK)
cd /d "%~dp0"
echo =======================================================
echo   RutaPrivada - Preparando App Conductor para Android
echo =======================================================
echo.
echo 1. Copiando archivos web al proyecto Android...
if exist "C:\Program Files\nodejs\node.exe" (
    call "C:\Program Files\nodejs\node.exe" preparar_app.js conductor
) else (
    call node preparar_app.js conductor
)

echo.
echo 2. Abriendo Android Studio...
if exist "C:\Program Files\nodejs\npx.cmd" (
    call "C:\Program Files\nodejs\npx.cmd" cap open android
) else (
    call npx cap open android
)

echo.
echo =======================================================
echo   Proceso finalizado. En Android Studio ve a:
echo   Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo =======================================================
pause
