@echo off
cd /d "%~dp0"
if not exist node_modules (set DENO_TLS_CA_STORE=system& deno install)
deno run -A npm:vite --open
