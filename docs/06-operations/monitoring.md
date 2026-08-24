# Monitoring

## Hiện có

- Docker healthcheck app gọi `/health`; endpoint query DB.
- DB/Redis/MinIO/ClamAV/backup healthcheck trong compose.
- JSON-file log rotation cho app/ClamAV; application shared logger.
- Backup service có health port/log và file rotation.
- `ZaloAccountStatusLog`, cron checkpoint, analytics/audit tables cung cấp một số operational history.

## Thiếu/UNKNOWN

Không có Prometheus/Grafana/APM/Sentry/central log/alert config trong repo; không có SLO, paging, synthetic check hay disk/certificate expiry alert. `/health` không kiểm Redis/storage/provider/worker sâu.

Tối thiểu cần alert: app/DB/Redis unhealthy, disk/volume, backup không tạo file, queue lag/fail, provider auth/reconnect, 5xx/429, certificate expiry và cron last-success.
