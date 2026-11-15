#!/usr/bin/env bash
# Restore MESS_APP from a daily backup. Run on the VM:
#   sudo bash /opt/mss/scripts/restore.sh /opt/mss/backups/daily/2026-11-20
# WARNING: drops and recreates the schema data. Confirm before running.
set -euo pipefail

SRC="${1:?usage: restore.sh <backup-dir>}"
ORACLE_HOME=/opt/oracle/product/23ai/dbhomeFree
export ORACLE_HOME PATH=$ORACLE_HOME/bin:$PATH

echo "Backup dir: $SRC"
ls -la "$SRC"

# --- Option A: Data Pump restore (preferred — restores schema+data) ---
if ls "$SRC"/mess_app_*.dmp >/dev/null 2>&1; then
  echo ">>> impdp restore from Data Pump dump"
  # register directory if needed
  sqlplus -s / as sysdba <<'SQL' >/dev/null 2>&1 || true
BEGIN EXECUTE IMMEDIATE 'CREATE OR REPLACE DIRECTORY BACKUP_DIR AS ''/opt/mss/backups/dpump''';
EXCEPTION WHEN OTHERS THEN NULL; END; / GRANT READ, WRITE ON DIRECTORY BACKUP_DIR TO MESS_APP;
SQL
  impdp "'/ as sysdba'" directory=BACKUP_DIR \
        dumpfile="$(basename "$SRC"/mess_app_*.dmp | head -1)" \
        schemas=MESS_APP content=all table_exists_action=replace logfile=restore_$(date +%s).log
  echo ">>> impdp done — verify with: SELECT COUNT(*) FROM MESS_APP.USERS;"
  exit 0
fi

# --- Option B: JSON row restore (requires scripts/import-json.js) ---
if [ -f "$SRC/mess_app_rows.json" ]; then
  echo ">>> JSON row restore"
  cd /opt/mss/backend && node scripts/import-json.js "$SRC/mess_app_rows.json"
  echo ">>> JSON restore done"
  exit 0
fi

echo "ERROR: no restorable artifact found in $SRC" >&2
exit 1
