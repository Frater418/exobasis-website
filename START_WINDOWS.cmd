@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Die direkte HTML-Ansicht wird geoeffnet.
  start "" "%~dp0START_HIER.html"
  pause
  exit /b 0
)
echo EXOBASIS - lokale Gesamtvorschau
echo Nach dem Start im Browser http://127.0.0.1:4173/de/ oeffnen.
echo Beenden mit Strg+C. Es gibt keinen Versand oder externen Zugriff.
node scripts\serve.mjs
pause
