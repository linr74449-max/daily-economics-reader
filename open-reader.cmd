@echo off
setlocal
where python.exe >nul 2>nul
if errorlevel 1 goto preview
python.exe -X utf8 "%~dp0tools\open_reader.py"
if not errorlevel 1 exit /b
:preview
start "" "%~dp0extension\index.html"
