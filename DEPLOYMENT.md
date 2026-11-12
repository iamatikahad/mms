# Deployment — Mess Management System (100% Free)

## Current live deployment

| Item | Value |
|---|---|
| Public URL | https://vincent-coaching-ruth-believes.trycloudflare.com |
| Backend | Node.js Express on this PC, port `4002` (production build `backend/dist`) |
| Frontend | React build `frontend/dist`, served by the backend (same origin) |
| Database | Oracle 12c `MESS_APP` @ `//localhost:1521/MNC` — stays on this PC, never exposed |
| Tunnel | Cloudflare Quick Tunnel (`cloudflared`) — free, no account, auto HTTPS |
| Cost | **৳0 / $0 — no accounts with billing, no trials, no card** |

Verified over public HTTPS: health, admin login, member login, dashboards, reports, PDF export, RBAC blocks, Secure+HttpOnly session cookie.

## How it works

```
Members' phones/PCs ──HTTPS──> Cloudflare edge ──QUIC tunnel──> cloudflared (this PC) ──> localhost:4002 (Node) ──> Oracle 12c (this PC)
```

The Oracle database is **never** exposed to the internet. Only the web app port is tunneled.

## Keeping it running

The app is live only while this PC is on and two processes run:

1. Backend: `cd backend && npm start` (serves API + built frontend)
2. Tunnel: `cloudflared tunnel --url http://localhost:4001 --no-autoupdate`

A helper script is provided: `start-app.ps1` (repo root) — run it to start both.

> Note: the backend `.env` uses `PORT=4001`. The currently running verification instance uses `4002`; either works — just keep tunnel `--url` and `PORT` in sync.

## Important limitation of Quick Tunnels

- The `*.trycloudflare.com` URL is **temporary** — it changes every time the tunnel restarts.
- If the PC sleeps/reboots, members must get the new URL.

### Permanent free URL (recommended, ~10 min, needs a free Cloudflare account)

A named tunnel gives a stable URL like `mess.yourdomain-free.com` or a free `*.cfargotunnel.com`-style hostname — still $0:

1. Create a free account at https://dash.cloudflare.com (email only, no card).
2. `cloudflared tunnel login` → pick your domain (free Cloudflare DNS, or use a free subdomain).
3. `cloudflared tunnel create mess-app` → note the tunnel ID.
4. Create `~/.cloudflared/config.yml` routing `mess.example.com` → `http://localhost:4001`.
5. `cloudflared tunnel route dns mess-app mess.example.com`
6. Run `cloudflared tunnel run mess-app` (or install as a Windows service: `cloudflared service install`).

Alternatively register a free domain via Cloudflare's free DNS on any domain you own.

## Why not Render/Railway/Oracle Cloud for the backend?

- **Render free** spins down after 15 min idle (cold starts ~30–60 s) and would need your Oracle DB reachable publicly — unsafe.
- **Oracle Cloud Always Free** could host an Autonomous Oracle DB, but: requires identity verification + card on file (even though never charged), and migrating 12c → 23ai/Autonomous is a real engine migration needing your approval.
- **Current setup is strictly better** for 5–10 members: real Oracle 12c, real data, zero migration risk, zero cost.

If the PC must stay off sometimes, the upgrade path is: Oracle Cloud Always Free VM (Ampere) running this same stack — still $0, but requires your account signup.

## Security notes for public use

- JWT secret was regenerated to a strong random value (`backend/.env`) — **all sessions were reset; everyone must log in again**.
- Cookies are `Secure` + `HttpOnly` + `SameSite=Lax` over HTTPS.
- `trust proxy` is enabled so rate limiting sees real visitor IPs.
- Keep `backend/.env` private — it contains DB + JWT secrets. Never commit it (already gitignored).
- Change `superadmin`/`testmember` passwords before sharing widely, or create per-member accounts.

## Sharing with members

Send them the public URL + their login (each member has own username/password created by admin in Member Management). They log in on phone browser or PC — the UI is responsive and supports বাংলা/English + dark/light.

## Future updates

1. Edit code → `cd backend && npm run build` and `cd frontend && npm run build`.
2. Restart the backend process (and tunnel only if the URL changed).
3. Oracle schema changes: add a file under `database/oracle/migrations/` and apply via SQL*Plus as `MESS_APP`.

## Troubleshooting

- `https://...trycloudflare.com` unreachable → check `cloudflared` is running and `localhost:4002/api/health` responds.
- Login works locally but not via URL → ensure you're using the tunnel URL, not `localhost`.
- URL changed after restart → redistribute the new URL, or set up the named tunnel above.
