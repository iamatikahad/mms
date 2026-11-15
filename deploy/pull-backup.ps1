# Pulls the latest VM backup to this PC. Run weekly (or set up Task Scheduler).
# Usage:  .\pull-backup.ps1 -VmIp 1.2.3.4 -KeyPath C:\Users\Atik\.ssh\id_ed25519
param(
  [Parameter(Mandatory=$true)][string]$VmIp,
  [Parameter(Mandatory=$true)][string]$KeyPath
)
$dest = Join-Path $PSScriptRoot '..\backups\vm'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd'
scp -i $KeyPath -r "ubuntu@${VmIp}:/opt/mss/backups/daily/$stamp" "$dest\$stamp"
if ($LASTEXITCODE -eq 0) { Write-Output "Backup $stamp downloaded to $dest\$stamp" }
else { Write-Output "scp failed (exit $LASTEXITCODE) — is the VM up and date folder present?" }
