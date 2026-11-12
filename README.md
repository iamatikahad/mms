<<<<<<< HEAD
# Mess Management System

Full-stack mess management for a shared mess: members, daily lunch/dinner requests with cutoff rules, guest meals, bazar/food expenses, monthly bills with member allocation, deposits, other charges, financial engine, reports, monthly closing with lock/reopen, notifications, audit logs, RBAC — backed by **Oracle Database 12c (12.1)** via `node-oracledb` Thin Mode.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + react-i18next (English/বাংলা) + Recharts + React Router
- **Backend**: Node.js + Express + TypeScript + `node-oracledb` 6.x (Thin Mode) + bcryptjs + express-session-style cookie auth
- **Database**: Oracle Database 12c Release 1 (12.1) — dedicated schema owner `MESS_APP`

## Repository layout

```
backend/            Express API (TypeScript, compiled to dist/)
  src/routes/       auth, members, meals, guests, bazar, bills, deposits,
                    charges, dashboard, reports, flowchart, closing,
                    notifications, admins, auditlogs, settings, files, profile
  src/services/     finance.ts (calculation engine), audit.ts, notify.ts
frontend/           React SPA (Vite)
database/oracle/    schema.sql, seeds.sql, setup.sql, verify.sql, migrations/
ORACLE_WINDOWS11_SETUP.md   Oracle detection/setup/backup/restore guide
TESTING_REPORT.md           What was tested and results
```

## Prerequisites

- Windows 11, Oracle Database 12c (12.1) installed and running (service `OracleServiceMNC`, listener on 1521)
- Node.js 20+ and npm
- SQL*Plus at `C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe` (adjust path if different)

## 1. Database setup

Follow `ORACLE_WINDOWS11_SETUP.md`. Short version:

```powershell
# as SYSTEM — create MESS_APP
Get-Content database\oracle\setup.sql | & "C:\app\product\12.1.0\dbhome_1\bin\sqlplus.exe" -S "SYSTEM/<dba>@//localhost:1521/MNC"
# as MESS_APP — schema + seeds + migrations
Get-Content database\oracle\schema.sql | & "...\sqlplus.exe" -S "MESS_APP/<pw>@//localhost:1521/MNC"
Get-Content database\oracle\seeds.sql  | & "...\sqlplus.exe" -S "MESS_APP/<pw>@//localhost:1521/MNC"
Get-Content database\oracle\migrations\0001_user_permissions.sql | & "...\sqlplus.exe" -S "MESS_APP/<pw>@//localhost:1521/MNC"
Get-Content database\oracle\verify.sql | & "...\sqlplus.exe" -S "MESS_APP/<pw>@//localhost:1521/MNC"
```

## 2. Backend

```powershell
cd backend
copy .env.example .env   # then edit DB_USER/DB_PASSWORD/DB_CONNECT_STRING
npm install
npm run build            # tsc -> dist/
npm start                # http://localhost:4001 (also serves the built frontend)
# or: npm run dev        # tsx watch mode
```

`DB_CONNECT_STRING` uses the detected service: `//localhost:1521/MNC`.

## 3. Frontend (development)

```powershell
cd frontend
npm install
npm run dev              # http://localhost:5173, proxies /api -> :4001
```

For production, `npm run build` in `frontend/` produces `frontend/dist`, which the backend serves automatically at `http://localhost:4001` — no separate static server needed.

## 4. Login

| Role | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `admin123` (change immediately) |
| Member (test) | `testmember` | `member123` |

Create more admins via **Admin Management** (Super Admin only). Members are created via **Member Management** — each member gets a login automatically.

## Roles & permissions

- **Super Admin**: everything, incl. admin management, settings, month reopen.
- **Admin**: permission-based (`PERMISSIONS` table, 23 keys); per-user overrides in `USER_PERMISSIONS`.
- **Member**: only own data — enforced server-side (`requireRole('MEMBER')` + `memberId` scoping); URL tampering cannot reach other members' records.

## Financial engine

Centralized in `backend/src/services/finance.ts`:

- `Total Chargeable Meals = Regular + Guest`
- `Meal Rate = Eligible Food Expenses ÷ Total Chargeable Meals`
- `Member Food Cost = (Regular + Guest meals) × Meal Rate`
- `Total Payable = Food Cost + Bill Allocation + Other Charges`
- `Balance = Deposits − Payable` (positive = advance, negative = due)

All money math uses rounded `NUMBER` values server-side; bill allocations use largest-remainder reconciliation so shares sum exactly to the bill amount.

## Monthly closing

**Monthly Closing** page → validate → close. Closing writes a snapshot to `MONTHLY_CLOSINGS`/`MONTHLY_ACCOUNTS` and blocks mutations to that month (`MONTH_CLOSED` errors). Only users with `closing.reopen` can reopen, and a reason is required and audited.

## Meal cutoff rules

Configurable in Settings (`meal.lunch_cutoff` = 11:00, `meal.dinner_cutoff` = 17:00, Asia/Dhaka). Members can submit/edit/cancel before cutoff; after cutoff requests are locked. Admins with `meals.override` (or Super Admin) can override with a mandatory reason — every override is audit-logged.

## i18n & theme

Language (English/বাংলা) and light/dark theme toggles are in the top bar; preferences persist in `localStorage` and are applied app-wide.

## Backup / restore

See `ORACLE_WINDOWS11_SETUP.md` §7–8 (`expdp`/`impdp`). Also protect `backend/.env` and `backend/uploads/` — receipts live on the filesystem, not in Oracle.

## Known limitations

See `TESTING_REPORT.md` §Known limitations.

## Troubleshooting

- `{"ok":false,"db":"disconnected"}` on `/api/health` → Oracle listener/database down, or wrong `DB_CONNECT_STRING`. Run `lsnrctl status`.
- Login `INVALID_CREDENTIALS` → check username case and that the user `STATUS='ACTIVE'`.
- `MONTH_CLOSED` on save → the month is closed; reopen it first (audited).
- Port 4001 busy → change `PORT` in `backend/.env`.
=======
# mms
>>>>>>> 2050e4991a17794a5e993ebc61ee63a8e0043469
