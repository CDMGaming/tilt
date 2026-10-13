@echo off
cd /d "%~dp0"
if not exist node_modules (set DENO_TLS_CA_STORE=system& deno install)
start "" http://localhost:5178
:loop
deno run -A tools/dev.ts
echo Dev server stopped, restarting...
timeout /t 2 >nul
goto loop
