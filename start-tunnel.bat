@echo off
REM The Attic 712 - Cloudflare Tunnel (named tunnel, config in %USERPROFILE%\.cloudflared\config.yml)
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run >> "C:\Users\Atik\Music\New folder\logs\tunnel.log" 2>&1
