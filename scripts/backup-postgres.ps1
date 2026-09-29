# Backup script for zalo-crm-solar PostgreSQL database (Windows PowerShell version)
# Schedule via Task Scheduler to run daily at 2 AM

param(
    [string]$BackupDir = (Join-Path $PSScriptRoot "..\backups"),
    [int]$BackupKeepCount = 2,
    [string]$DBContainer = "zalo-crm-db",
    [string]$DBName = "zalocrm",
    [string]$DBUser = "crmuser"
)

# Create backup directory if it doesn't exist
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $BackupDir "zalocrm_${timestamp}.sql.gz"

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting PostgreSQL backup (zalo-crm-solar)..." -ForegroundColor Green

# Check if Docker container is running
$containerCheck = docker ps --filter "name=$DBContainer" --format "{{.Names}}"
if (-not $containerCheck) {
    Write-Host "[ERROR] Container $DBContainer is not running" -ForegroundColor Red
    exit 1
}

# Perform backup using PowerShell and pipe to gzip
try {
    Write-Host "  Dumping database: $DBName..." -ForegroundColor Cyan
    $output = docker exec $DBContainer pg_dump -U $DBUser --format=plain --no-password $DBName | 
              Out-File -FilePath "$backupFile.tmp" -Encoding UTF8 -NoNewline
    
    # Compress using PowerShell or 7-Zip if available
    if (Get-Command 7z -ErrorAction SilentlyContinue) {
        7z a -tgzip -mx=9 $backupFile "$backupFile.tmp" | Out-Null
        Remove-Item "$backupFile.tmp"
    } else {
        Write-Host "  Note: 7-Zip not found, using uncompressed backup" -ForegroundColor Yellow
        Rename-Item -Path "$backupFile.tmp" -NewName ($backupFile -replace '\.sql\.gz$', '.sql') -Force
        $backupFile = $backupFile -replace '\.sql\.gz$', '.sql'
    }
    
    $fileSize = (Get-Item $backupFile).Length / 1MB
    Write-Host "[SUCCESS] Backup saved to: $backupFile (Size: $([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Backup failed: $_" -ForegroundColor Red
    exit 1
}

# Cleanup old backups by snapshot content. Category files created by the Docker
# backup image can be hard links, so identical hashes count as one snapshot.
if ($BackupKeepCount -lt 1) {
    throw "BackupKeepCount must be a positive integer"
}
$snapshotGroups = Get-ChildItem $BackupDir -Recurse -File |
    Where-Object { $_.Name -match '\.sql(\.gz)?$' -and $_.Name -notmatch '-latest\.sql' } |
    ForEach-Object {
        [PSCustomObject]@{
            File = $_
            Hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
        }
    } |
    Group-Object Hash |
    Sort-Object { ($_.Group.File.LastWriteTime | Measure-Object -Maximum).Maximum } -Descending

$snapshotGroups | Select-Object -Skip $BackupKeepCount | ForEach-Object {
    $_.Group.File | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "  Deleted: $($_.FullName)" -ForegroundColor Yellow
    }
}

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup complete!" -ForegroundColor Green
