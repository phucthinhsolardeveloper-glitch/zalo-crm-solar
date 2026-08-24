# Lộ trình triển khai CRM & AI — Phúc Thịnh Solar

*Đối chiếu JD "Nhân viên lập trình AI & tự động hoá" (MTCV-NVQD, bản 01) với hiện trạng thật của hai codebase đã clone: `crm-custom` và `zalo-crm-solar`, khảo sát trực tiếp source code (không dựa vào README/changelog).*

**Ngày lập:** 18/08/2026
**Phạm vi:** 1 lập trình viên duy nhất

---

## Tóm tắt điều hành

**Phần lõi đã sẵn sàng vận hành, không cần code thêm để deploy.** `crm-custom` đang ở trạng thái "Shipped & Hardened" — CRM khách hàng, đơn hàng, thanh toán/đối soát ngân hàng, phân quyền RBAC và dashboard đã hoạt động thật, đã audit bảo mật. `zalo-crm-solar` cũng vậy cho kênh chat Zalo và chấm điểm/phân loại lead tự động. Việc "trước deploy" ở đây chủ yếu là **vận hành hoá** (backup, secrets, seed quyền), không phải xây tính năng mới.

Hai lỗ hổng lớn nhất so với JD: **toàn bộ mảng nghiệp vụ kỹ thuật** (Kho, Bảo hành, Công trình, vật tư, lịch bảo trì) **chưa tồn tại ở bất kỳ hệ thống nào**, và **engine tự động hoá của `zalo-crm-solar` đã bị khoá ở bản Enterprise** (hook rỗng, xác nhận lại bằng code — không phải suy đoán). **Đã chốt hướng đi:** tự viết automation hook thay vì mua Enterprise Edition, và ưu tiên xây **Kho + Bảo hành** trước trong nhóm phát triển dài hạn (Công trình để sau, chờ xác nhận nhu cầu thật với phòng Kỹ thuật).

Rủi ro cần xử lý sớm nhất **không phải là kỹ thuật**: `zalo-crm-solar` dùng giấy phép **AGPL-3.0** — nên có đánh giá pháp lý trước khi tuỳ biến sâu hoặc dùng làm phần mềm nội bộ chính thức lâu dài.

| | |
|---|---|
| **13** | hạng mục JD đã có sẵn, không cần xây |
| **8** | việc bắt buộc trước khi go-live (P0) |
| **9** | hạng mục nên hoàn thiện ngay sau go-live (P1) |
| **16** | hạng mục để lại phát triển dài hạn (P2) |

---

## Hiện trạng hai hệ thống

### `crm-custom`
NestJS 11 + Next.js 16 · PostgreSQL · 51 module · 56 model Prisma · **"Shipped & Hardened"**

- Khách hàng / Đơn hàng: **đầy đủ** (Customer, Lead, Order, Payment, đối soát ngân hàng tự động)
- Phân quyền / Audit log: **đầy đủ**, RBAC 4 vai trò thật
- Dashboard / KPI: **đầy đủ** (dashboard service riêng dài 1854 dòng)
- Tự động hoá: **hẹp** — chỉ có phân công lead (assignment templates, AI weighted distribution, auto-recall)
- Kho / Bảo hành / Công trình: **gần như không có**

Điểm mạnh bất ngờ: module `mcp-agent` đã là một **MCP server thật**, expose sẵn tool cho lead/khách hàng/đơn hàng/thống kê — nền tảng tốt để nối AI Agent (Claude/GPT/Flowise) mà không cần xây lại.

### `zalo-crm-solar`
Fastify 5 + Vue 3 · PostgreSQL · 26 module · **AGPL-3.0** (fork ZaloCRM)

- Chat Zalo: **đầy đủ**, lõi sản phẩm
- Chấm điểm / auto-tag lead: **đầy đủ**, hoạt động thật (signal detector, auto-decay, stuck-lead)
- AI Chatbot (RAG): **gần xong** — đã chạy thật với Zalo, thiếu parser PDF/DOCX
- Omicall / Zalo OA (ZCC) gọi điện: **gần xong**, chờ Omicall xác nhận vài mục kỹ thuật
- Automation engine: **gần như trống** — đã xác nhận lại bằng code: `ee-registry/automation.ts` toàn bộ hook rỗng, `importFacebookLeads` trả lỗi `"not available in this edition"`. `event-bus.ts` hoạt động thật nhưng không ai lắng nghe — hạ tầng có sẵn, chỉ thiếu implementation.

---

## Thứ tự ưu tiên triển khai

### P0 — Trước khi go-live *(tuần 1–2)*

1. **Audit pháp lý AGPL-3.0 cho zalo-crm-solar** — làm trước khi tuỳ biến sâu thêm hoặc công bố là phần mềm nội bộ chính thức lâu dài.
2. **Thiết lập & kiểm thử backup cho cả 2 database** — không xác nhận được từ code là đã có job backup production, cần kiểm tra và test khôi phục thật.
3. **Seed RBAC theo tổ chức thật + xoay toàn bộ secrets/API keys** — cơ chế phân quyền đã có sẵn ở cả 2 hệ, chỉ cần cấu hình đúng trước khi mở cho nhân viên dùng.
4. **Hoàn thiện AI Chatbot: thêm parser PDF/DOCX** — đã chạy thật với Zalo (log similarity xác nhận), chỉ còn thiếu bước đọc tài liệu, vài ngày là xong.
5. **Đẩy Omicall + Zalo OA (ZCC) qua production gate** — code gần như hoàn chỉnh, liên hệ Omicall xác nhận các mục kỹ thuật còn lại.
6. **Go-live `crm-custom`: CRM, Đơn hàng, Thanh toán, Dashboard** — không cần code thêm, chỉ triển khai production và đào tạo người dùng.
7. **Go-live `zalo-crm-solar`: kênh chat Zalo + chấm điểm/phân loại lead** — đã hoạt động thật, không phải chờ automation engine.
8. **Automation: tự viết hook (đã chốt, không mua Enterprise)** — nối trực tiếp vào seam `event-bus.ts` có sẵn trong zalo-crm-solar, không phụ thuộc bản Enterprise của ZaloCRM.

### P1 — Ngay sau khi vận hành ổn định bước đầu *(ngày 15–60)*

1. **Facebook Lead → CRM** — dùng nhánh `/external/leads` đã có sẵn trong `crm-custom`, không đụng vào nhánh Facebook đã bị khoá của zalo-crm-solar.
2. **Module Báo giá tự động (mới)** — xây trong `crm-custom`, tận dụng Order/Product/Customer đã có sẵn, đúng ví dụ JD nêu cho 30 ngày đầu.
3. **AI Agent hỗ trợ telesales & CSKH qua Flowise/Langflow** — nối vào MCP server có sẵn ở `mcp-agent` thay vì tự xây nền tảng Agent từ đầu, đúng ưu tiên công cụ JD đề cập.
4. **Website → CRM (endpoint thật)** — hiện chỉ có schema/type placeholder ở zalo-crm-solar, cần một webhook thu lead thật.
5. **Viết automation hook thật cho 1–2 workflow ưu tiên nhất** — implement `registerAutomationHooks()` trong `event-bus.ts`, hướng tự viết đã chốt, không chờ Enterprise.
6. **Tinh chỉnh Dashboard doanh số/KPI theo yêu cầu Giám đốc** — nền đã có sẵn ở cả 2 hệ, chỉ cần bổ sung chỉ số thật cần.
7. **Nối đủ 3 provider AI qua MCP: OpenAI, Claude, Gemini** — hiện chỉ mới dùng Gemini cho tóm tắt cuộc gọi, mở rộng để linh hoạt chọn model theo tác vụ.
8. **Auto gửi Zalo theo kịch bản cụ thể** — hạ tầng gửi tin đã có, chỉ thiếu kịch bản tự động (nhắc hẹn, chăm sóc sau bán).
9. **Rà soát nguồn Lead thực tế đang thiếu (Facebook/Website/TikTok)** — xác nhận với Marketing kênh nào công ty thật sự chạy quảng cáo trước khi build thêm.

### P2 — Sau khi vận hành ổn định, mở rộng dài hạn *(từ tháng 3 trở đi)*

1. **Module Kho (Warehouse) — đã chốt ưu tiên xây** — mở rộng trong `crm-custom`: model tồn kho, nhập/xuất kho, liên kết Product đã có sẵn, hoàn toàn chưa có ở cả 2 hệ.
2. **Module Bảo hành (Warranty) — đã chốt ưu tiên xây** — mở rộng trong `crm-custom`: nối vào Order/Product đã có sẵn, tạo phiếu bảo hành + nhắc lịch bảo trì.
3. **Module Công trình + vật tư + tiến độ thi công (chưa chốt)** — domain hoàn toàn mới, trống ở cả 2 hệ, để sau Kho/Bảo hành, xác nhận nhu cầu thật với phòng Kỹ thuật trước khi đầu tư.
4. **AI tạo hợp đồng, AI tạo hồ sơ dự án** — phụ thuộc module Báo giá/Hợp đồng và Công trình ở trên.
5. **Google Drive / Gmail / Calendar, TikTok, Email→CRM, SMS** — chỉ xây khi phòng ban xác nhận nhu cầu cụ thể, tránh xây tính năng không ai dùng.
6. **Đồng bộ định danh khách hàng giữa 2 hệ thống** — kiến trúc "channel adapter", làm sau khi từng hệ đã ổn định riêng lẻ vì rủi ro dữ liệu cao hơn.
7. **Module Nhân sự đầy đủ (chấm công, lương, nghỉ phép)** — cân nhắc dùng SaaS ngoài thay vì tự xây, lệch trọng tâm vai trò AI/tự động hoá.
8. **Nâng cấp quy trình: CI/CD, staging, Definition of Done chính quy** — nâng dần khi có thời gian, không phù hợp áp cứng ngay với 1 IT duy nhất.

---

## Lộ trình 90 ngày

Bám khung 90 ngày của JD, điều chỉnh lại theo đúng hiện trạng code — nhiều mốc JD tưởng "phải xây" thực ra đã có sẵn, nên thời gian dồn vào phần thật sự thiếu.

**Ngày 1–30 — Vận hành hoá & hoàn thiện quick-win**
- Hoàn tất toàn bộ nhóm P0 (audit AGPL, backup, RBAC, secrets)
- Hoàn thiện AI Chatbot (parser PDF/DOCX) & đẩy Omicall qua production
- Go-live crm-custom + zalo-crm-solar cho phần đã sẵn sàng
- Bắt đầu Facebook Lead → CRM + Báo giá tự động

**Ngày 31–60 — AI Agent & hoàn thiện KPI kinh doanh**
- AI Agent telesales/CSKH qua Flowise/Langflow, nối mcp-agent
- Website → CRM, automation hook cho 1–2 workflow tiếp theo
- Tinh chỉnh dashboard doanh số theo yêu cầu Giám đốc thật
- *(CRM nội bộ "phiên bản đầu tiên" mà JD nêu ở mốc này thực ra đã xong từ trước, không cần lặp lại)*

**Ngày 61–90 — Xây Kho + Bảo hành (đã chốt)**
- Thiết kế schema Kho + Bảo hành trên nền crm-custom, bắt đầu module đầu tiên
- Công trình để sau — chờ xác nhận nhu cầu thật với phòng Kỹ thuật
- Đánh giá hiệu quả tự động hoá đã triển khai, đào tạo nhân viên
- Đề xuất ý tưởng cải tiến tiếp theo cho Giám đốc

---

## Đối chiếu chi tiết theo từng mục JD

### 1. Phát triển phần mềm nội bộ

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| CRM khách hàng | crm-custom + zalo-crm-solar | Đã có | — |
| Quản lý đơn hàng | crm-custom | Đã có | — |
| Quản lý kho | — | Chưa có | P2 |
| Quản lý bảo hành | — | Chưa có | P2 |
| Quản lý công trình | — | Chưa có | P2 |
| Quản lý nhân sự | crm-custom | Một phần | P2 |
| Dashboard báo cáo | crm-custom + zalo-crm-solar | Đã có | — |

### 2. Phát triển AI

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| AI Chatbot | zalo-crm-solar | Một phần | P0 |
| AI Agent (nền tảng) | crm-custom (mcp-agent) | Một phần | P1 |
| AI trả lời khách hàng | zalo-crm-solar | Một phần | P0 |
| AI phân loại khách hàng | zalo-crm-solar (scoring) | Đã có | — |
| AI hỗ trợ telesales | crm-custom (ai-summary) | Một phần | P1 |
| AI chăm sóc khách hàng | — | Chưa có | P2 |
| AI tạo báo giá | — | Chưa có | P1 |
| AI tạo hợp đồng | — | Chưa có | P2 |
| AI tạo hồ sơ dự án | — | Chưa có | P2 |

### 3. Tự động hoá quy trình

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| Facebook Lead → CRM | crm-custom (endpoint sẵn) | Một phần | P1 |
| Website → CRM | zalo-crm-solar (sơ khai) | Một phần | P1 |
| Zalo → CRM | zalo-crm-solar | Đã có | — |
| Email → CRM | — | Chưa có | P2 |
| Auto gửi Email | — | Chưa có | P2 |
| Auto gửi Zalo | zalo-crm-solar | Đã có nền | P1 |
| Auto gửi SMS | — | Chưa có | P2 |
| Tạo báo giá tự động | — | Chưa có | P1 |
| Tạo hợp đồng tự động | — | Chưa có | P2 |
| Nhắc lịch bảo trì | — | Chưa có | P2 |
| Tạo phiếu bảo hành | — | Chưa có | P2 |
| Phân công nhân viên | crm-custom | Đã có | — |

### 4. Kết nối API

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| OpenAI / Claude / Gemini | crm-custom (mcp-agent) | Một phần | P1 |
| Google Sheets | zalo-crm-solar | Đã có | — |
| Google Drive / Gmail / Calendar | — | Chưa có | P2 |
| Facebook | crm-custom (sơ khai) / zalo-crm-solar (khoá) | Một phần | P1 |
| Zalo OA | zalo-crm-solar | Đã có | — |
| TikTok | — | Chưa có (chỉ placeholder) | P2 |
| Website | zalo-crm-solar (sơ khai) | Một phần | P1 |

### 5. Quản trị dữ liệu

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| Thiết kế Database | crm-custom + zalo-crm-solar | Đã có | — |
| Backup dữ liệu | — | Cần xác nhận | P0 |
| Đồng bộ dữ liệu (giữa 2 hệ) | — | Chưa có | P2 |
| Bảo mật dữ liệu | crm-custom (đã audit) / zalo-crm-solar | Một phần | P0 |
| Phân quyền người dùng | crm-custom + zalo-crm-solar | Đã có (cần seed đúng) | P0 |

### 6. Hỗ trợ marketing

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| Tự động đăng bài | — | Chưa có | P2 |
| Thu thập Lead | crm-custom + zalo-crm-solar | Một phần | P1 |
| Đồng bộ dữ liệu quảng cáo | — | Chưa có | P2 |
| Phân tích hiệu quả marketing | crm-custom + zalo-crm-solar | Một phần | P2 |
| Dashboard KPI | crm-custom + zalo-crm-solar | Đã có | — |

### 7. Hỗ trợ phòng kinh doanh

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| CRM / Dashboard doanh số / KPI Sales / Theo dõi khách hàng | crm-custom | Đã có | — |
| Theo dõi tiến độ dự án | — | Chưa có | P2 |

### 8. Hỗ trợ phòng Kỹ thuật

| Hạng mục | Hệ thống | Hiện trạng | Ưu tiên |
|---|---|---|---|
| Bảo hành / Công trình / Vật tư / Lịch bảo trì / Tiến độ thi công | — | Chưa có (toàn bộ) | P2 |

### 9. Nghiên cứu AI hàng tuần

Không phải hạng mục xây — duy trì hàng tuần song song mọi giai đoạn.

---

## Rủi ro & khuyến nghị

**Pháp lý** — AGPL-3.0 của zalo-crm-solar là rủi ro cao nhất trong toàn bộ lộ trình, không phải rủi ro kỹ thuật. Cần đánh giá trước khi tuỳ biến sâu hoặc dùng thay thế một phần mềm thương mại.

**Trùng lặp dữ liệu** — Không xây lại Customer/Order/Product trong `zalo-crm-solar`; `crm-custom` đã là sổ cái thật, đã audit. Zalo-crm-solar nên giữ vai trò kênh giao tiếp, không mở rộng thành ERP thứ hai.

**Quy mô đội ngũ** — CI/CD đầy đủ, staging riêng, Definition of Done 17 mục phù hợp đội 5–10 người, không phù hợp 1 IT duy nhất đang báo cáo tiến độ hằng ngày. Áp dụng nhẹ (nhánh git + backup có test restore hằng tuần), nâng dần khi có thời gian.

**Build vs. Buy** — Với KPI "1–2 AI Agent/tháng", dùng Flowise/Langflow (JD ưu tiên) thay vì tự xây nền tảng Agent, đặc biệt vì `mcp-agent` đã có sẵn tool interface để nối vào ngay.

**Xác nhận nhu cầu** — Trước khi xây Kho/Bảo hành/Công trình/TikTok/SMS, xác nhận với phòng ban liên quan đây có phải nhu cầu thật, tránh xây tính năng không ai dùng trong khi KPI JD yêu cầu 2–4 module/tháng.

---

*Lộ trình dựa trên khảo sát trực tiếp source code hai repo cục bộ (không dựa vào README/changelog) đối chiếu với MTCV-NVQD bản 01 và ghi chú phân tích nội bộ ngày trước đó. Cần cập nhật lại nếu code thay đổi đáng kể.*
