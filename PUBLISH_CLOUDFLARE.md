# Publishing The Attic 712 via Cloudflare Tunnel

Architecture: Internet → Cloudflare HTTPS → cloudflared → localhost:4001 (Node serves API + built frontend + Socket.IO). Oracle 1521 stays local-only.

## One-time setup (requires YOUR Cloudflare account + domain)

1. `cloudflared tunnel login` — opens browser, pick your domain (adds cert.pem to ~/.cloudflared)
2. `cloudflared tunnel create attic712` — prints tunnel UUID + credentials JSON
3. `cloudflared tunnel route dns attic712 app.YOUR_DOMAIN.com`
4. Copy `cloudflared-config.example.yml` → `%USERPROFILE%\.cloudflared\config.yml`, fill TUNNEL_ID + hostname
5. In `backend/.env` set `CLIENT_URL=https://app.YOUR_DOMAIN.com`

## Run
- `start-all.bat` — backend (node dist) + tunnel
- Logs: `logs/backend.log`, `logs/tunnel.log`
- Stop: close the two minimized windows or taskkill node/cloudflared

## Auto-start on boot (Task Scheduler, run once as admin)
- Backend: `schtasks /create /tn "Attic712-Backend" /tr "\"C:\Users\Atik\Music\New folder\start-backend-prod.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST`
  (or /sc onlogon for user context — Oracle service must be running first)
- Tunnel: same pattern with start-tunnel.bat
- Add a 30s delay trigger or wrap backend start in a wait-for-Oracle loop.

## Verify
- https://app.YOUR_DOMAIN.com → login works, dashboard loads
- wss:// same origin for chat/real-time (cloudflared proxies WS automatically)
- /api/health → {"ok":true,"db":"connected"}
