@echo off
setlocal
cd /d "%~dp0"
set "LUMA_NPM=npm.cmd"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "LUMA_NPM=%ProgramFiles%\nodejs\npm.cmd"
if not exist "node_modules\vite" (
  call "%LUMA_NPM%" ci
  if errorlevel 1 goto end
)
call "%LUMA_NPM%" run dev
:end
pause
