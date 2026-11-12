# Oracle Database scripts

Target: Oracle Database 12c Release 1 (12.1), service `MNC` on `localhost:1521`.

## Files
- `setup.sql` — run once as SYSDBA to create the `MESS_APP` user.
- `schema.sql` — creates all tables/indexes (idempotent).
- `seeds.sql` — roles, permissions, categories, settings, super admin.
- `verify.sql` — sanity checks after setup.
- `migrations/` — future incremental changes.

## Run order (Windows, SQL*Plus)

```bat
:: 1. As SYSDBA (local OS auth)
sqlplus / as sysdba @database\oracle\setup.sql

:: 2. As the application user
sqlplus MESS_APP/mess_1236@//localhost:1521/MNC @database\oracle\schema.sql
sqlplus MESS_APP/mess_1236@//localhost:1521/MNC @database\oracle\seeds.sql
sqlplus MESS_APP/mess_1236@//localhost:1521/MNC @database\oracle\verify.sql
```

## Default login
- Username: `superadmin`
- Password: `SuperAdmin@123` (change after first login)

## Connection string used by the backend
`//localhost:1521/MNC` with user `MESS_APP`.
