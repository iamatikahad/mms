# Oracle Database 12c (12.1) Setup on Windows 11 — Mess Management System

This document describes exactly how the Oracle Database was detected, configured, and verified on this machine, and how to reproduce the setup on a fresh Windows 11 install.

---

## 1. Environment detected on this PC

| Item | Detected value |
|---|---|
| OS | Windows 11 |
| Oracle Home | `C:\app\product\12.1.0\dbhome_1` |
| Oracle version | `12.1.0.2.0`, 64-bit Enterprise Edition (`V$VERSION`) |
| SQL*Plus | `C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe` |
| Listener | `OracleOraDB12Home1TNSListener` (port 1521) |
| Database service | `OracleServiceMNC` |
| **Actual service name** | **`MNC`** (detected via `lsnrctl status` — *not* `ORCL`) |
| Hostname | `DESKTOP-K5LUR68` |
| Listener port | `1521` |
| Connect string used | `//localhost:1521/MNC` |
| Node.js | v24.22.2 |
| npm | 11.19.1 |
| Driver | `node-oracledb` 6.10.0 — **Thin Mode** (no Instant Client needed) |

The service name was detected with `lsnrctl status`, which listed `MNC` and `MNCXDB` under "Services Summary". The application uses Easy Connect syntax `//localhost:1521/MNC`, which works regardless of TNSNAMES.ORA configuration.

## 2. Application database user

A dedicated runtime account was created — **never `SYSTEM`**:

```sql
CREATE USER MESS_APP IDENTIFIED BY <password>
  DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW,
      CREATE PROCEDURE, CREATE TRIGGER TO MESS_APP;
```

`MESS_APP` owns all application tables. `SYSTEM` was used only for the one-time DBA operations above.

## 3. Running the SQL scripts

All scripts live in `database/oracle/` and are safe to re-run (they use `CREATE TABLE` guards / `MERGE`).

From PowerShell:

```powershell
# 1. Create/verify the MESS_APP user (run as SYSTEM)
Get-Content database\oracle\setup.sql | & "C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe" -S "SYSTEM/<dba-password>@//localhost:1521/MNC"

# 2. Create schema + seed data (run as MESS_APP)
Get-Content database\oracle\schema.sql | & "C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe" -S "MESS_APP/<app-password>@//localhost:1521/MNC"
Get-Content database\oracle\seeds.sql  | & "C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe" -S "MESS_APP/<app-password>@//localhost:1521/MNC"

# 3. Apply migrations (in order)
Get-Content database\oracle\migrations\0001_user_permissions.sql | & "C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe" -S "MESS_APP/<app-password>@//localhost:1521/MNC"

# 4. Verify
Get-Content database\oracle\verify.sql | & "C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe" -S "MESS_APP/<app-password>@//localhost:1521/MNC"
```

Notes for PowerShell:
- Pipe script contents via `Get-Content ... | sqlplus` or use `sqlplus "user/pass@//host:port/service" @script.sql`.
- Do **not** use Bash heredocs (`<<'EOF'`) — this is PowerShell.
- Quote `@script` paths; an unquoted `@` can be parsed as a splat operator.

## 4. Backend configuration

`backend/.env` (never commit real passwords):

```env
DB_USER=MESS_APP
DB_PASSWORD=<app-password>
DB_CONNECT_STRING=//localhost:1521/MNC
PORT=4001
CLIENT_URL=http://localhost:5173
```

See `backend/.env.example` for the template. `node-oracledb` runs in **Thin Mode** by default — no Oracle Client install or `initOracleClient()` call is required for this driver/DB combination.

## 5. First Super Admin

`seeds.sql` inserts `superadmin` with a bcrypt hash of `admin123`. **Change it immediately after first login** (Profile → Change Password, or `POST /api/auth/change-password`). To create additional admins use Admin Management in the UI or `POST /api/admins`.

To reset the superadmin password manually:

```powershell
cd backend
node -e "console.log(require('bcryptjs').hashSync('YourNewPassword',10))"
# then UPDATE USERS SET PASSWORD_HASH='<hash>' WHERE USERNAME='superadmin';
```

## 6. Troubleshooting connection problems

| Symptom | Check |
|---|---|
| `NJS-118` / cannot connect | Listener running? `lsnrctl status`. Database mounted/open? `sqlplus / as sysdba` → `SELECT OPEN_MODE FROM V$DATABASE;` |
| `ORA-12505` | Wrong service name — run `lsnrctl status` and use the exact service name in `DB_CONNECT_STRING`. |
| `ORA-01017` | Wrong user/password, or account locked — `ALTER USER MESS_APP ACCOUNT UNLOCK;` |
| `NJS-099`/`NJS-108` bind errors | Driver Thin Mode positional binds `:1,:2` — this codebase already uses positional binds throughout. |
| `dpkg`/ Thick-mode errors | Not applicable — Thin Mode is used. If Thick Mode is ever required, install Oracle Instant Client and call `oracledb.initOracleClient({libDir})`. |

## 7. Backup

Logical backup of the schema (run as MESS_APP or SYSTEM):

```powershell
# Schema + data export (expdp)
& "C:\app\product\12.1.0\dbhome_1\bin\expdp.exe" "MESS_APP/<pw>@//localhost:1521/MNC" DIRECTORY=DATA_PUMP_DIR DUMPFILE=mess_backup.dmp LOGFILE=expdp_mess.log FULL=Y
```

If `DATA_PUMP_DIR` is not defined, create one or use `exp.exe` (original export) to a filesystem path. Also back up `backend/.env` and uploaded files in `backend/uploads/` securely — they are not in Oracle.

## 8. Restore

```powershell
& "C:\app\product\12.1.0\dbhome_1\bin\impdp.exe" "SYSTEM/<dba>@//localhost:1521/MNC" DIRECTORY=DATA_PUMP_DIR DUMPFILE=mess_backup.dmp FULL=Y
```

For a logical-only restore into the existing `MESS_APP` schema, drop/recreate the user first (only if you intend to wipe data):

```sql
DROP USER MESS_APP CASCADE;
-- then re-run setup.sql, schema.sql, seeds.sql, migrations
```

## 9. What was verified on this machine

- `V$VERSION` → 12.1.0.2.0; listener services `MNC`, `MNCXDB`.
- `MESS_APP` connects via `//localhost:1521/MNC` in Thin Mode.
- 24 application tables created; seeds loaded (roles, 23 permissions, 48 role-permission rows, 9 bill categories, 9 expense categories, 8 system settings, superadmin).
- Backend `/api/health` → `{"ok":true,"db":"connected"}`.
- End-to-end API tests: login (all 3 roles), member CRUD, meal requests with cutoff/lock/override, guest meals, bazar, bills + allocations + payments, deposits + reversals, charges, reports, monthly closing → lock → reopen, audit logs, notifications, settings.
- Frontend production build (`vite build`) succeeds; the built SPA is served by the backend at `http://localhost:4001`.
