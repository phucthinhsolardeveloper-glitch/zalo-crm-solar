# PostgreSQL Backup & Restore Procedure

**Last Updated:** 2026-08-18  
**Status:** P0 — Setup complete, ready for production

---

## 📋 Mục đích

Đảm bảo tính an toàn dữ liệu bằng cách:
1. ✅ Backup tự động hằng ngày PostgreSQL của cả **crm-custom** và **zalo-crm-solar**
2. ✅ Giữ lại 7 ngày backup (cleanup tự động)
3. ✅ Test restore procedure để chắc khôi phục được
4. ✅ Ghi chép quá trình để TBH có thể làm lại nếu cần

---

## 🔧 Setup Hướng dẫn

### Trên Windows (Khuyến nghị)

#### 1️⃣ **Chuẩn bị**
```powershell
# 1. Cài đặt 7-Zip (để nén backup) — nếu chưa có
# Download: https://www.7-zip.org/
# Cài vào "Program Files\7-Zip" (mặc định)

# 2. Mở PowerShell as Admin
# Chạy lệnh để cho phép chạy script:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 3. Kiểm tra Docker đang chạy
docker ps
```

#### 2️⃣ **Test Backup (crm-custom)**
```powershell
# 1. Chạy script backup
cd D:\IT\crm-custom
& ".\scripts\backup-postgres.ps1"

# 2. Kiểm tra kết quả
Get-ChildItem .\backups\
# Nên thấy file: postgres_20260818_020000.sql.gz

# 3. Kiểm tra log (tìm "[SUCCESS]")
```

#### 3️⃣ **Test Restore (crm-custom)**
```powershell
cd D:\IT\crm-custom

# 1. Tìm file backup gần nhất
$backupFile = Get-ChildItem .\backups\postgres_*.sql.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
echo $backupFile

# 2. Chạy restore test (NÓ KHÔNG ĐÈ NGUYÊN DB GỐC)
# PowerShell restore test không sẵn sàng trên Windows trực tiếp
# Thay vào đó, dùng Docker CLI trực tiếp:

# Tạo test DB
docker exec crm-postgres createdb -U crm crm_v4_restore_test

# Restore từ backup
gunzip -c $backupFile | docker exec -i crm-postgres psql -U crm -d crm_v4_restore_test

# 3. Kiểm tra dữ liệu
docker exec crm-postgres psql -U crm -d crm_v4_restore_test -c "SELECT COUNT(*) as lead_count FROM leads;"
docker exec crm-postgres psql -U crm -d crm_v4_restore_test -c "SELECT COUNT(*) as order_count FROM orders;"

# 4. Xoá test DB khi xác nhận OK
docker exec crm-postgres dropdb -U crm crm_v4_restore_test
```

#### 4️⃣ **Lặp lại cho zalo-crm-solar**
```powershell
cd D:\IT\zalo-crm-solar

# Backup
& ".\scripts\backup-postgres.ps1"

# Test restore (tương tự)
$backupFile = Get-ChildItem .\backups\zalocrm_*.sql.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }

# Tạo test DB
docker exec zalo-crm-db createdb -U crmuser zalocrm_restore_test

# Restore
gunzip -c $backupFile | docker exec -i zalo-crm-db psql -U crmuser -d zalocrm_restore_test

# Verify
docker exec zalo-crm-db psql -U crmuser -d zalocrm_restore_test -c "SELECT COUNT(*) FROM contacts;"

# Cleanup
docker exec zalo-crm-db dropdb -U crmuser zalocrm_restore_test
```

#### 5️⃣ **Thiết lập Backup Tự động (Hằng ngày lúc 2 AM)**

Trên Windows, dùng **Task Scheduler**:

```powershell
# Tạo task cho crm-custom backup
$taskName = "CRM-Custom-Backup"
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File D:\IT\crm-custom\scripts\backup-postgres.ps1"
$taskTrigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$taskSettings = New-ScheduledTaskSettingsSet -RunOnlyIfNetworkAvailable
$principal = New-ScheduledTaskPrincipal -UserID "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $taskAction `
  -Trigger $taskTrigger -Settings $taskSettings -Principal $principal -Force

Write-Host "✅ Task created: $taskName (runs daily at 2:00 AM)"

# Tạo task cho zalo-crm-solar backup
$taskName2 = "Zalo-CRM-Backup"
$taskAction2 = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File D:\IT\zalo-crm-solar\scripts\backup-postgres.ps1"

Register-ScheduledTask -TaskName $taskName2 -Action $taskAction2 `
  -Trigger $taskTrigger -Settings $taskSettings -Principal $principal -Force

Write-Host "✅ Task created: $taskName2 (runs daily at 2:00 AM)"

# Verify tasks
Get-ScheduledTask -TaskName "*CRM*" | Format-Table TaskName, State, Triggers
```

**Kiểm tra kết quả:**
- Đợi đến 2 AM hôm sau, hoặc
- Chạy thủ công: `Start-ScheduledTask -TaskName "CRM-Custom-Backup"`
- Kiểm tra log: `Get-Content "D:\IT\crm-custom\backups\*" | Select-Object -Last 20`

---

### Trên Linux (Nếu dùng server Linux sau này)

```bash
# 1. Copy scripts sang server
scp crm-custom/scripts/backup-postgres.sh user@server:/opt/crm/
scp zalo-crm-solar/scripts/backup-postgres.sh user@server:/opt/zalo/

# 2. Cho phép chạy
chmod +x /opt/crm/backup-postgres.sh
chmod +x /opt/zalo/backup-postgres.sh

# 3. Setup cron jobs
crontab -e
# Thêm 2 dòng:
0 2 * * * /opt/crm/backup-postgres.sh
0 2 * * * /opt/zalo/backup-postgres.sh

# 4. Test
/opt/crm/backup-postgres.sh
/opt/zalo/backup-postgres.sh

# 5. Kiểm tra log
tail -f /var/log/cron
```

---

## 📊 Checklist Hoàn thiện

- [ ] **crm-custom backup** chạy thành công (kiểm tra file `backups/postgres_*.sql.gz`)
- [ ] **crm-custom restore test** — khôi phục được dữ liệu từ backup
- [ ] **zalo-crm-solar backup** chạy thành công (kiểm tra file `backups/zalocrm_*.sql.gz`)
- [ ] **zalo-crm-solar restore test** — khôi phục được dữ liệu từ backup
- [ ] **Task Scheduler** được cấu hình chạy hằng ngày lúc 2:00 AM
- [ ] **Backup cleanup** — kiểm tra files cũ được xoá (chỉ giữ 7 ngày)
- [ ] **Tài liệu** — ghi chép lại procedure để TBH có thể restore nếu cần

---

## 🚨 Khẩn cấp — Restore nếu DB bị hỏng

```powershell
# 1. Dừng container (để DB lock)
docker stop crm-postgres

# 2. Xoá volume cũ (nếu cần)
docker volume rm crm-postgres-data-corrupted  # backup tên volume cũ
docker volume create crm-postgres-data  # tạo volume mới

# 3. Khởi động container (sẽ init DB mới)
docker start crm-postgres

# 4. Restore từ backup
$backupFile = "D:\IT\crm-custom\backups\postgres_20260815_020000.sql.gz"
gunzip -c $backupFile | docker exec -i crm-postgres psql -U crm -d crm_v4

# 5. Kiểm tra
docker exec crm-postgres psql -U crm -d crm_v4 -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# 6. Khởi động app
docker compose up -d
```

---

## 📝 Notes

- **Backup location:** `D:\IT\crm-custom\backups\` và `D:\IT\zalo-crm-solar\backups\`
- **Retention:** 7 ngày (tự động xoá backup cũ hơn)
- **Frequency:** Hằng ngày lúc 2:00 AM (có thể điều chỉnh)
- **Format:** `.sql.gz` (compressed) — tiết kiệm space
- **Restore test:** Hằng tuần (chủ Nhật 3 AM) để chắc khôi phục được

---

**Contact:** Nếu backup thất bại, check:
1. Docker containers đang chạy? `docker ps`
2. 7-Zip cài đặt? `Get-Command 7z`
3. Disk space đủ? `Get-Volume`
4. Log file: `D:\IT\crm-custom\backups\*` (xem [ERROR])
