@echo off
setlocal
cd /d "%~dp0"
set "LUMA_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if exist "%LUMA_PNPM%" (
  if not exist "node_modules\vite" call "%LUMA_PNPM%" install --frozen-lockfile
  call "%LUMA_PNPM%" dev
) else (
  if exist "%ProgramFiles%\nodejs\npm.cmd" (
    if not exist "node_modules\vite" call "%ProgramFiles%\nodejs\npm.cmd" install
    call "%ProgramFiles%\nodejs\npm.cmd" run dev
  ) else (
    echo Install Node.js 22.12 or newer, then run npm install and npm run dev.
  )
)
pause
