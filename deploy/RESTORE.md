# MMS — Backup & Restore Guide

## Where backups live

- **On the VM**: `/opt/mss/backups/daily/YYYY-MM-DD/` — one folder per day, kept 7 days.
  Each folder contains `mess_app_*.dmp` (Oracle Data Pump, full schema+data) and
  `mess_app_rows.json` (row-level export, human-readable).
- **Log**: `/opt/mss/backups/backup.log`

## Automatic schedule

`cron` runs `/opt/mss/scripts/backup.sh` daily at **03:15 UTC**.
Check it: `crontab -l | grep backup`

## Download a backup to YOUR computer (Windows)

From PowerShell on your PC (key stays on your PC, never shared):

```powershell
scp -i C:\Users\Atik\.ssh\id_ed25519 -r ubuntu@<VM-IP>:/opt/mss/backups/daily/2026-11-20 C:\Users\Atik\Music\New folder\backups\
```

Or grab the whole folder with WinSCP / FileZilla using the same key.

**I recommend running this weekly** so a copy always exists off the VM.
If you want, I can also set up automatic download to a folder on your PC
(Task Scheduler + scp) — just ask.

## Restore on the VM

```bash
ssh -i <key> ubuntu@<VM-IP>
sudo bash /opt/mss/scripts/restore.sh /opt/mss/backups/daily/YYYY-MM-DD
```

- If a `.dmp` exists → Data Pump restore (schema + data, replaces existing).
- Else → JSON row restore (needs `backend/scripts/import-json.js` — I'll create it during deploy).

Restore does NOT touch users' passwords differently — it restores whatever was
in the backup, including password hashes.

## Your ORIGINAL 12c backup (untouched, on your PC)

`C:\Users\Atik\Music\New folder\backups\db_backup_2026-11-12T16-50-47-615Z.json`
— never modified by deployment. It remains the ultimate fallback.
