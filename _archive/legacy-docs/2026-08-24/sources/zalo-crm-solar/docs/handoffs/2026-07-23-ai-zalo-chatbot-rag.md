# Handoff: AI Zalo Chatbot + RAG

Ngày: 2026-07-23  
Worktree: `.worktrees/ai-chatbot`  
Trạng thái: implementation hoàn tất, chưa commit, chưa chạy migration trên database thật.

## Yêu cầu đã triển khai

- Chatbot tự trả lời tin nhắn khách trong hội thoại Zalo thật, 1-1.
- Chỉ chạy khi AI chung đang bật, toggle chatbot bật, có ít nhất một tài liệu RAG `ready`, đang trong lịch hoạt động và chưa có tin sale gửi tay trong hội thoại.
- Sale gửi từ CRM (`sentVia=user`) hoặc app Zalo (`sentVia=user_native`) sẽ dừng chatbot vĩnh viễn cho hội thoại đó.
- Bot tiếp tục trả lời các câu sau nếu sale chưa từng trả lời.
- Không đủ ngữ cảnh theo similarity threshold hoặc model trả `NO_ANSWER` thì không gửi.
- Provider chatbot cố định là OpenAI; API key/base URL dùng cấu hình OpenAI per-org đã có.
- Mọi tin gửi đi qua `zaloOps.sendMessage` để dùng rate limit/reconnect hiện có.
- Tin bot lưu `sentVia=automation`, metadata sender `kind=bot_ai`, hiển thị badge "Trợ lý AI · Chatbot Zalo".
- Có quota riêng theo ngày/múi giờ tổ chức, audit ActivityLog và log chatbot.
- Có idempotency lock database theo `(orgId, triggerMessageId)` để nhiều process không gửi trùng.
- Toggle mặc định OFF.

## Dữ liệu và migration

Migration mới:

- `backend/prisma/migrations/20260723060000_ai_zalo_chatbot_rag/migration.sql`

Thay đổi `AiConfig`:

- `zaloChatbotEnabled=false`
- model mặc định `gpt-4.1-mini`
- prompt riêng
- lịch Thứ 2-Thứ 6 và Thứ 7-Chủ nhật, hỗ trợ khung qua nửa đêm
- quota mặc định 200/ngày
- similarity mặc định `0.4`, top-K mặc định `5` (dry-run tiếng Việt cho thấy `0.7` loại nhầm câu hỏi khớp tài liệu)
- embedding model `text-embedding-3-small`

Bảng mới:

- `ai_knowledge_docs`: metadata/status tài liệu.
- `ai_knowledge_chunks`: chunk text + embedding JSON.
- `ai_chatbot_logs`: `processing | sent | skipped | error`, câu hỏi/trả lời/similarity/source docs.

Cả ba bảng đã được thêm vào tenant guard và RLS policy.

Trước khi chạy app trên môi trường có DB:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

## Backend

File chính:

- `backend/src/modules/ai/ai-chatbot-service.ts`: ingest, OpenAI embeddings, retrieval cosine, sinh câu trả lời, gate/race check, gửi Zalo, persist, audit, emit privacy-safe.
- `backend/src/modules/ai/ai-chatbot-utils.ts`: logic thuần cho schedule, start-of-day theo timezone, chunking và cosine.
- `backend/src/modules/ai/ai-routes.ts`: API cấu hình/RAG/log.
- `backend/src/modules/zalo/zalo-listener-factory.ts`: fire-and-forget trigger sau khi inbound message persist.
- `backend/src/modules/ai/ai-capabilities.ts`: capability `send_zalo_chatbot_reply`.

API mới, đều dưới `/api/v1`:

- `GET /ai/chatbot/config`
- `PUT /ai/chatbot/config`
- `GET /ai/chatbot/documents`
- `POST /ai/chatbot/documents` với `{ name, content }`
- `POST /ai/chatbot/documents/upload` multipart field `file`
- `DELETE /ai/chatbot/documents/:id`
- `GET /ai/chatbot/logs?limit=50`

GET yêu cầu grant `settings.access`; mutation yêu cầu `settings.edit`.

## Frontend

`frontend/src/views/settings/AiAssistantPage.vue` được đổi thành trang hai tab:

- Chatbot Zalo: trạng thái/toggle, lịch weekday/weekend, model, quota, top-K, similarity slider, prompt, upload/dán/xoá tài liệu và log.
- Trợ lý nội bộ: giữ lại toggle, prompt và regex của virtual chat cũ.

`frontend/vite.config.ts` hỗ trợ `VITE_BACKEND_URL` để chạy worktree song song
với stack hiện có; mặc định vẫn là `http://localhost:3000`.

Toggle chatbot bị disable khi chưa có tài liệu ready. Backend vẫn kiểm tra lại nên xoá hết tài liệu sẽ làm chatbot dừng dù config còn bật.

## Luồng runtime

1. Listener lưu inbound message và emit cho frontend.
2. `triggerZaloChatbotReply` kiểm tra toggle, RAG, hội thoại 1-1 thật, lịch, noise, sale đã trả lời và quota.
3. Tạo log `processing` để claim duy nhất trigger message.
4. Embed câu hỏi, cosine toàn bộ chunk cùng org, lấy top-K và lọc threshold.
5. Gọi OpenAI chat completion với prompt grounded; `NO_ANSWER` thành `skipped`.
6. Kiểm tra lại sale vừa trả lời trong thời gian AI chạy.
7. Tạo message placeholder `automation`, gửi qua Zalo wrapper, cập nhật Zalo msg ID.
8. Update log `sent`, audit ActivityLog, emit persisted message qua `emitChatMessage` có tenant scope/privacy redaction.

## Verification đã chạy

Pass:

```text
Prisma schema validate
Prisma Client generate
Backend TypeScript build
Frontend vue-tsc + Vite production build
backend/tests/ai-chatbot-utils.test.ts: 8/8
Frontend full suite: 26/26
git diff --check
```

Backend full suite hiện không xanh: 37 file pass, 47 file fail. Các failure quan sát được thuộc trạng thái nền của worktree:

- Nhiều test import `src/modules/automation/*` nhưng Community worktree không có module `_ee/automation`.
- Test mock cũ không export `tenantTransaction` hoặc thiếu model Prisma mock.
- Test integration PostgreSQL bị `connect EPERM 127.0.0.1:5432` trong sandbox.
- Một số assertion hiện có không khớp code hiện tại ở friend/group/profile routes.

Không có failure từ `ai-chatbot-utils.test.ts`; backend/frontend build đều pass sau thay đổi cuối.

## Live test cô lập ngày 2026-07-23

Không đụng vào stack đang chạy ở cổng `3080`/`5433`. Một môi trường test riêng đã được dựng:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- PostgreSQL test: container `zalo-crm-db-ai-chatbot-test`, cổng `5434`
- Tài khoản: `admin@chatbot.test` / `TestChatbot@2026`

Đã deploy đủ 111 migration vào DB test, tạo organization riêng, gọi thành công API config/document/log qua auth và RBAC, rồi ingest tài liệu mẫu bằng OpenAI embedding thật.

Dry-run retrieval + generation bằng service thật, không gửi Zalo:

```text
Câu khớp: "Phí giao hàng nội thành là bao nhiêu?"
Similarity: 0.44720076031065076
Kết quả: "Phí giao hàng nội thành là 30.000 đồng. Đơn hàng trên 1.000.000 đồng sẽ được miễn phí giao hàng bạn nhé."

Câu ngoài tài liệu: "Công ty có bán xe máy điện màu xanh không?"
Similarity: 0.3764953536020945
Kết quả: NO_ANSWER
```

Kết quả này là lý do similarity mặc định được chỉnh từ `0.7` xuống `0.4`: câu đúng vượt ngưỡng, câu không liên quan bị loại. Sau chỉnh sửa cuối, Prisma validate, backend build, frontend build và `8/8` unit test đều pass.

Môi trường test hiện được để chạy cho QA thủ công. Token OpenAI chỉ được đọc từ `.env` của repo chính lúc khởi động backend, không được ghi vào source hay tài liệu này.

### Chẩn đoán test Zalo thật

Listener đã nhận thành công tin nhắn từ tài khoản Zalo khác. Hai lần test đầu không có phản hồi vì đều bị RAG loại đúng với `reason=no_relevant_context`:

```text
"Tôi cần tư vấn" -> similarity 0.3350391245266152
"bề chưa"       -> similarity 0.24033026554240616
```

Hai câu này không có đáp án trong tài liệu mẫu. Ngoài ra UI đã được lưu ở threshold `0.45`, trong khi câu hỏi chuẩn về phí giao hàng chỉ đạt khoảng `0.4472`; cấu hình DB test đã được đưa về `0.4`. Cần hoàn tất E2E bằng cách nhắn `Phí giao hàng nội thành là bao nhiêu?` và xác nhận log chuyển sang `sent`.

Theo phản hồi QA, lời chào/yêu cầu hỗ trợ chung không nên bị bỏ qua. Đã thêm `isGenericSupportRequest` và fallback cố định:

```text
Chào bạn, mình sẵn sàng hỗ trợ. Bạn vui lòng mô tả rõ hơn nội dung cần tư vấn nhé.
```

Fallback áp dụng cho các dạng như `Xin chào`, `Shop ơi`, `Tôi cần tư vấn`, `Có ai hỗ trợ mình không?`; câu hỏi cụ thể ngoài tài liệu và chuỗi không rõ nghĩa vẫn giữ `no_relevant_context`. Fallback không gọi OpenAI, không gắn source document giả, nhưng vẫn đi qua quota, kiểm tra sale trả lời, idempotency và luồng gửi Zalo bình thường. Unit test mục tiêu hiện `16/16` pass và backend build pass.

## Giới hạn và việc nên làm tiếp

- Upload hiện hỗ trợ text UTF-8: TXT, Markdown, CSV, JSON, tối đa 1 MB. PDF/DOCX chưa hỗ trợ vì repo chưa có parser tương ứng.
- Cosine chạy in-process và đọc tối đa 5.000 chunk/org. Phù hợp knowledge base nhỏ/vừa; nếu vượt quy mô này nên chuyển sang pgvector hoặc vector store.
- Đã test database và OpenAI thật trong môi trường cô lập. Chưa test bước gửi/nhận Zalo thật vì DB test chưa kết nối tài khoản Zalo; cần đăng nhập URL trên và kết nối một tài khoản Zalo test để hoàn tất E2E cuối.
- Chưa có UI xem source chunk chi tiết trong từng log; log đã lưu `sourceDocIds` để bổ sung sau.
- Nên QA thủ công hai race case trên staging: sale trả lời trong lúc OpenAI đang chạy, và hai app instance nhận cùng trigger.
- `npm ci` báo dependency tree hiện có 32 vulnerabilities; không chạy `npm audit fix` vì ngoài phạm vi feature và có thể tạo breaking changes.

## Working tree

Các file feature đang modified/untracked, chưa stage và chưa commit. Không revert thay đổi ngoài phạm vi nếu worktree có thêm chỉnh sửa từ agent khác.
