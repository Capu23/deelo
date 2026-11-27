@echo off
REM Programa scripts\coto-semanal.bat todos los domingos a las 21:00 en el Programador de tareas de Windows.
REM Hacer doble clic una sola vez. Para quitarla, abrir el Programador de tareas y eliminar "deelo - Coto semanal".
schtasks /create /tn "deelo - Coto semanal" /tr "\"%~dp0coto-semanal.bat\"" /sc weekly /d SUN /st 21:00 /f
if errorlevel 1 (
  echo No se pudo crear la tarea.
) else (
  echo Listo: corre todos los domingos a las 21:00.
  echo Para probarla ahora: schtasks /run /tn "deelo - Coto semanal"
)
pause
