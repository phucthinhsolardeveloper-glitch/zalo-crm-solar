# Storage và antivirus

## Driver và boundary

Ứng dụng hỗ trợ `local` và S3-compatible/R2; Docker Compose có MinIO. Production snapshot 2026-08-24 dùng `STORAGE_DRIVER=local` dù MinIO vẫn chạy. Sự hiện diện của container không chứng minh app đang ghi vào đó.

Media dùng cho Zalo có thể cần URL provider truy cập được; recording và dữ liệu riêng phải đi qua authorization/private delivery và encryption phù hợp. Public URL, private object và retention không được dùng lẫn.

## Upload pipeline

Validation cần bao gồm size, MIME/content, tên/path an toàn và org/owner. File phải được scan trước khi trở thành nội dung tin cậy. ClamAV ở production được xác minh bật fail-closed: scan lỗi/không khả dụng phải chặn theo policy thay vì cho qua âm thầm.

## Failure và vận hành

Kiểm disk/quota, orphan file khi DB transaction fail, DB record khi upload fail, expired signed URL, backup/restore cả metadata lẫn object và migration driver. Không coi DB dump là backup media. MinIO/R2 credential không được log hoặc đưa vào docs.

Verification: clean/malicious test file an toàn, MIME spoof, oversize, cross-org access, provider URL fetch, disk full, scanner unavailable, object missing và restore rehearsal metadata+media. Retention/lifecycle/off-host backup hiện `NEEDS VERIFICATION`.
