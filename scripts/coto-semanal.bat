@echo off
REM ============================================================================
REM  deelo - Catalogo semanal de Coto (corre en una compu en Argentina)
REM
REM  1. Baja la ultima version de main.
REM  2. Corre scraper\coto-precios.js (lee la web de Coto, unos minutos).
REM  3. Sube data\coto-catalogo.json a la rama "coto-semanal".
REM  GitHub lo valida y, si esta bien, lo pasa solo a main (workflow "deelo: catalogo de Coto").
REM
REM  Deja un registro en scripts\coto-semanal.log. Se programa con scripts\instalar-tarea-coto.bat
REM ============================================================================
setlocal
cd /d "%~dp0.."
set "LOG=%~dp0coto-semanal.log"
echo. >> "%LOG%"
echo ===== %date% %time% ===== >> "%LOG%"

git checkout main >> "%LOG%" 2>&1 || goto :error
git pull --ff-only origin main >> "%LOG%" 2>&1 || goto :error
node scraper\coto-precios.js >> "%LOG%" 2>&1 || goto :error

git checkout -B coto-semanal >> "%LOG%" 2>&1 || goto :error
git add data\coto-catalogo.json >> "%LOG%" 2>&1
git commit -m "Coto: catalogo semanal" >> "%LOG%" 2>&1
git push -f origin coto-semanal >> "%LOG%" 2>&1 || goto :error
git checkout -f main >> "%LOG%" 2>&1
echo OK: catalogo subido a coto-semanal >> "%LOG%"
exit /b 0

:error
echo ERROR: algo fallo, ver arriba >> "%LOG%"
git checkout -f main >> "%LOG%" 2>&1
exit /b 1
