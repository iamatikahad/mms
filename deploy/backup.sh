#!/usr/bin/env bash
# Daily MESS_APP schema backup — Oracle Data Pump + JSON row export.
# Retention: keeps last 7 daily backups. Run via cron: 15 3 * * * /opt/mss/scripts/backup.sh
set -euo pipefail

BACKUP_ROOT=/opt/mss/backups/daily
ORACLE_HOME=/opt/oracle/product/23ai/dbhomeFree
export ORACLE_HOME
export PATH=$ORACLE_HOME/bin:$PATH
export NLS_DATE_FORMAT='YYYY-MM-DD HH24:MI:SS'

STAMP=$(date +%Y-%m-%d)
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

# --- Oracle Data Pump (schema-level, restorable via impdp) ---
DMP_DIR=/opt/mss/backups/dpump
mkdir -p "$DMP_DIR"
cat > /tmp/mess_backup.par <<'EOF'
SCHEMAS=MESS_APP
DIRECTORY=BACKUP_DIR
DUMPFILE=mess_app_%U.dmp
LOGFILE=mess_app_backup.log
COMPRESSION=ALL
EOF
# register directory once
sqlplus -s / as sysdba <<'SQL' >/dev/null 2>&1 || true
BEGIN
  EXECUTE IMMEDIATE 'CREATE OR REPLACE DIRECTORY BACKUP_DIR AS ''/opt/mss/backups/dpump''';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
GRANT READ, WRITE ON DIRECTORY BACKUP_DIR TO MESS_APP;
SQL

expdp "'/ as sysdba'" parfile=/tmp/mess_backup.par 2>&1 | tail -5 || \
  expdp mess_app/"$DB_PASSWORD" parfile=/tmp/mess_backup.par 2>&1 | tail -5

# move today's dump into dated folder for clarity
find "$DMP_DIR" -name 'mess_app_*.dmp' -newermt "today" -exec mv {} "$DEST/" \; 2>/dev/null || true
find "$DMP_DIR" -name 'mess_app_backup.log' -newermt "today" -exec cp {} "$DEST/" \; 2>/dev/null || true

# --- JSON row-level export (independent second copy, same format as local backups) ---
cd /opt/mss/backend
node scripts/export-json.js "$DEST/mess_app_rows.json" 2>/dev/null || \
  echo "WARN: JSON export script missing — Data Pump dump is the primary backup"

# --- retention: keep last 7 daily dirs ---
ls -1dt "$BACKUP_ROOT"/*/ | tail -n +8 | xargs -r rm -rf

echo "[$(date -Is)] backup complete -> $DEST" >> /opt/mss/backups/backup.log
