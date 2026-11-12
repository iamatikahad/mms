# Starts the Mess Management backend (production build) + Cloudflare quick tunnel.
# Requires: Oracle DB running, Node.js installed, cloudflared installed (winget install Cloudflare.cloudflared).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$port = (Select-String -Path "$root\backend\.env" -Pattern '^PORT=(\d+)').Matches.Groups[1].Value
if (-not $port) { $port = '4001' }

# Start backend if not already listening
$up = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $up) {
    Write-Host "Starting backend on port $port ..."
    Start-Process node -ArgumentList 'dist/index.js' -WorkingDirectory "$root\backend" -WindowStyle Hidden
    Start-Sleep -Seconds 4
} else {
    Write-Host "Backend already listening on port $port"
}

# Start tunnel if not running
$tunnel = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $tunnel) {
    Write-Host "Starting Cloudflare tunnel -> http://localhost:$port ..."
    Start-Process cloudflared -ArgumentList "tunnel --url http://localhost:$port --no-autoupdate" -WindowStyle Hidden
    Write-Host "Tunnel URL is printed in the cloudflared window/logs (https://*.trycloudflare.com)"
} else {
    Write-Host "cloudflared already running"
}
Write-Host "Done. App: http://localhost:$port  |  Public URL: see cloudflared output."
