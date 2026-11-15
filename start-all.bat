@echo off
REM Start backend first, then tunnel. Run as needed or via Task Scheduler.
start "attic712-backend" /min cmd /c "C:\Users\Atik\Music\New folder\start-backend-prod.bat"
timeout /t 5 /nobreak >nul
start "attic712-tunnel" /min cmd /c "C:\Users\Atik\Music\New folder\start-tunnel.bat"
