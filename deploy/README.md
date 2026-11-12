# Mess Management System — Oracle Cloud Always Free deployment

Architecture (all free, 24/7, no dependency on your PC):

```
Internet ──► VM public IP :443 (Caddy, auto-HTTPS)
              ├── /            → static frontend (frontend/dist via nginx)
              ├── /api/*       → Node backend :4002
              ├── /socket.io/* → Node backend :4002 (websocket)
              └── /uploads/*   → backend/uploads
Oracle Database 23ai Free ──► localhost:1521 (MESS_APP schema)
```

- VM: `VM.Standard.A1.Flex` (Ampere ARM, Always Free — up to 4 OCPU / 24 GB). Use 2 OCPU / 12 GB.
- OS: Oracle Linux 8 (has ARM64 Oracle 23ai Free RPMs) or Ubuntu 22.04/24.04.
- Domain: free DuckDNS subdomain → VM IP. Caddy gets a real Let's Encrypt cert.
- Frontend `api.ts` uses relative `/api` — no rebuild changes needed; nginx proxies it.

## One-time setup (I will run this over SSH once you give me access)

```bash
# 1. Oracle Cloud account → Create VM (see DEPLOY_OCI.md for click-path)
# 2. Open ports 80,443 in the VM's Security List + iptables/firewalld
# 3. Run:  bash deploy/setup-vm.sh
# 4. Copy backend/.env.production values (see deploy/env.production.example)
# 5. Import schema: run migrations 0001–0004 + base schema on 23ai Free
# 6. systemctl enable --now mess-backend caddy
```

## Free-tier limits to know

- A1 Flex: 4 OCPU / 24 GB total across ALL Ampere VMs in your tenancy — 2/12 is safe.
- 2 AMD Micro VMs also free (too small for Oracle DB — don't use for DB).
- 200 GB block storage free — plenty.
- Oracle 23ai Free is Oracle's own free DB (production-grade, not XE).
- Outbound internet traffic: 10 TB/month free.
- DuckDNS + Let's Encrypt: free.
- No sleep/idle shutdown — VM runs until you stop it.
