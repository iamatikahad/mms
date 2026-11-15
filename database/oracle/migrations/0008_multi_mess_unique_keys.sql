-- 0008: multi-mess unique keys (applied 2026-11-15 via MESS_APP)
-- Business-key uniqueness must be per-mess.

-- MONTHLY_ACCOUNTS: one row per (month, mess)
ALTER TABLE MONTHLY_ACCOUNTS DROP CONSTRAINT UQ_MONTHLY_ACCT;
CREATE UNIQUE INDEX UQ_MONTHLY_ACCT ON MONTHLY_ACCOUNTS(ACCOUNT_MONTH, MESS_ID);

-- MONTHLY_CLOSINGS is an append-only closing log (close -> reopen -> re-close
-- produces multiple rows per month). Unique key removed; non-unique index added.
DROP INDEX UQ_CLOSING_MONTH;
CREATE INDEX IX_CLOSING_MONTH_MESS ON MONTHLY_CLOSINGS(ACCOUNT_MONTH, MESS_ID, CLOSING_ID);

-- SYSTEM_SETTINGS: PK was SETTING_KEY alone, blocking per-mess overrides for a
-- second mess. Replaced with unique index on (key, mess) where global=NULL->0.
ALTER TABLE SYSTEM_SETTINGS DROP CONSTRAINT SYS_C0010441;
CREATE UNIQUE INDEX UQ_SETTINGS_KEY_MESS ON SYSTEM_SETTINGS(SETTING_KEY, NVL(MESS_ID,0));
