@echo off
chcp 65001 >nul
title 루미큐브 서버
cd /d "%~dp0"
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Users\kyg92\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "node_modules\web-push\package.json" (
  where npm >nul 2>nul || (echo Node.js를 설치한 뒤 npm ci를 한 번 실행해 주세요. & pause & exit /b 1)
  call npm ci --omit=dev
  if errorlevel 1 (pause & exit /b 1)
)
start "" http://localhost:3000
"%NODE%" server.js
pause
