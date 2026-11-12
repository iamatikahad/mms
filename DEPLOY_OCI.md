# Deploy to Oracle Cloud Always Free — step-by-step

## Part 1 — Create the free account (you, ~15 min)

1. Go to **https://www.oracle.com/cloud/free/** → "Start for free".
2. Sign up with email, set a password. Oracle will ask for a **credit/debit card for identity verification** — Always Free resources are never charged; set a budget alert anyway (Billing → Budgets → $1).
3. Choose home region closest to you (e.g. Hyderabad/Mumbai for Bangladesh — lower latency).
4. Wait for "Your Free Trial is ready" email (can take 5–60 min).

## Part 2 — Create the VM (you, ~10 min)

1. Console → ☰ → Compute → Instances → Create Instance.
2. Name: `mess-app`. Image: **Oracle Linux 8** (or Ubuntu 24.04 aarch64).
3. Shape: **Change shape → Ampere → VM.Standard.A1.Flex** → 2 OCPU / 12 GB (free).
4. Networking: leave defaults (new VCN, assign public IPv4 ✅).
5. Add your SSH key: generate one locally —
   `ssh-keygen -t ed25519` — paste the `.pub` contents, or download the console-generated key.
6. Create. Note the **Public IP**.

## Part 3 — Open ports (you, ~3 min)

VM instance → Subnet → Default Security List → Add Ingress Rules:
- `0.0.0.0/0` TCP **80** and **443** (stateless OK).
(SSH 22 is already open by default.)

## Part 4 — Give me access (then I do everything else)

Send me ONE of:
- The VM's **public IP** + the SSH private key file path on your PC (e.g. `C:\Users\Atik\.ssh\id_ed25519`), or
- Run this once so I can reach it: keep the VM running and tell me the IP + key path.

I will then, over SSH:
1. Install Node 20, nginx/Caddy, firewall rules.
2. Install **Oracle Database 23ai Free** (Oracle's free production DB — replaces your local 12c; schema/migrations are compatible).
3. Upload the repo, `npm ci && npm run build` for backend + frontend.
4. Create `MESS_APP` schema user, apply migrations 0001–0004.
5. Configure systemd services (auto-restart on crash/reboot).
6. Set up free **DuckDNS** hostname + Caddy auto-HTTPS.
7. Migrate your cleaned production data (I have the JSON backup from the cleanup).
8. Test every feature end-to-end and give you the permanent URL.

## What you do NOT need to do

- No domain purchase (DuckDNS free subdomain works).
- No paid services anywhere in this stack.
- Nothing runs on your PC after migration — the VM is independent.

## Rollback / safety

- Your local Oracle 12c stays untouched as the fallback.
- The JSON backup `backups/db_backup_*.json` can restore data if needed.
- VM stop/start doesn't lose data (block storage persists); IP may change on stop — DuckDNS + update fixes it, or keep the VM running (it costs $0 either way).
