#!/usr/bin/env bash
# Mess Management System — Oracle Cloud VM provisioning (Oracle Linux 8 / Ubuntu)
# Run as root or with sudo on a fresh VM.Standard.A1.Flex instance.
set -euo pipefail

echo "=== 1/7 Base packages ==="
dnf install -y git nginx tar gzip firewalld 2>/dev/null || apt-get update && apt-get install -y git nginx tar gzip

# Node.js 20 LTS (works on ARM64)
if ! command -v node >/dev/null; then
  echo "=== 2/7 Node.js 20 ==="
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null || \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  dnf install -y nodejs 2>/dev/null || apt-get install -y nodejs
fi
node -v; npm -v

echo "=== 3/7 Firewall: open 80/443 ==="
if command -v firewall-cmd >/dev/null; then
  firewall-cmd --permanent --add-service=http --add-service=https
  firewall-cmd --reload
else
  ufw allow 80,443/tcp || true
fi

echo "=== 4/7 App directory ==="
mkdir -p /opt/mess/{backend,frontend}
cd /opt/mess

echo "=== 5/7 Copy project (run from repo root on your PC instead) ==="
# This script expects the repo to be uploaded first, e.g.:
#   scp -r "New folder" ubuntu@VM_IP:/opt/mess/repo
# Then run the remaining steps manually — see DEPLOY_OCI.md

echo "=== 6/7 Oracle DB ==="
# Oracle 23ai Free for OL8 ARM64:
#   https://www.oracle.com/database/sqldeveloper/technologies/oracle-database-23ai-free/
#   download oracle-database-23ai-free-*.rpm, then:
#   dnf install -y oracle-database-23ai-free-*.rpm
# Creates CDB FREEPDB1 on port 1521. Then create MESS_APP user and run migrations.

echo "=== 7/7 Services ==="
# systemd units are in deploy/mess-backend.service — install manually:
#   cp deploy/mess-backend.service /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now mess-backend

echo "Done with base setup. See DEPLOY_OCI.md for the full click-path and remaining steps."
