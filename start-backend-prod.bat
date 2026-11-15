@echo off
REM The Attic 712 - production backend (Node dist + Oracle + serves frontend/dist)
cd /d "C:\Users\Atik\Music\New folder\backend"
node dist\index.js >> logs\backend.log 2>&1
