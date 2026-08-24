# Security checklist

- [ ] HTTPS/domain/reverse proxy; MinIO API và admin console được firewall/rate-limit đúng.
- [x] Production JWT/encryption key fail-fast.
- [x] Refresh token rotation + hash + reuse detection.
- [x] Socket JWT/org room middleware.
- [ ] Telephony grant matrix + role/browser tests.
- [ ] Tenant guard warn→enforce và RLS staging→production.
- [ ] CSP report-only→enforce sau khi report sạch.
- [x] Antivirus runtime enabled/fail-closed tại snapshot 2026-08-24.
- [x] Recording ciphertext/private namespace.
- [ ] Authenticated cross-role recording playback test.
- [ ] Secret vault/rotation evidence; rotate credential từng xuất hiện trong legacy docs.
- [ ] Dependency/SAST/secret scan CI.
- [ ] Restore rehearsal và incident tabletop.

Checklist là gate, không phải bằng chứng tự thân; cập nhật link đến test/runtime evidence khi đóng mục.
