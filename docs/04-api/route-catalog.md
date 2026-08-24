# Backend route catalog

Catalog được sinh từ 375 literal `app.get/post/put/patch/delete` declarations trong Fastify source tại snapshot 2026-08-24, branch `fix/omicall-sip-call-history`, commit `6c7e99c`. Ba tag route groups đã được ghép mount prefix từ `app.ts`.

Catalog chỉ chứng minh route literal tồn tại. Nó không bắt được route tạo bằng biến/`app.route`/plugin ngoài pattern; audit trước đó đếm khoảng 404 declaration nên catalog không được coi là OpenAPI đầy đủ. Permission/payload/response phải đọc source, middleware, schema/service và test. Public routes được liệt kê riêng nhưng vẫn có token/signature/rate-limit contract theo implementation.

## account-folders (4)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/account-folders` | `backend/src/modules/chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders` | `backend/src/modules/chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders/reorder` | `backend/src/modules/chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders/sync-by-owner` | `backend/src/modules/chat/folder-routes.ts` |

## admin (9)

| Method | Effective path | Source |
|---|---|---|
| `POST` | `/api/v1/admin/engagement/backfill` | `backend/src/modules/engagement/engagement-routes.ts` |
| `POST` | `/api/v1/admin/engagement/recompute` | `backend/src/modules/engagement/engagement-routes.ts` |
| `POST` | `/api/v1/admin/migrate-status-table` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/admin/privacy/audit` | `backend/src/modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/admin/privacy/reset-lock/:userId` | `backend/src/modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/admin/rbac/create-test-users` | `backend/src/modules/rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/migrate-legacy-users` | `backend/src/modules/rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/seed-default-groups` | `backend/src/modules/rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/run-detector` | `backend/src/modules/contacts/contact-routes.ts` |

## ai (20)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/ai/assistant-config` | `backend/src/modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/assistant-config` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/chatbot/config` | `backend/src/modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/chatbot/config` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/chatbot/documents` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/chatbot/documents` | `backend/src/modules/ai/ai-routes.ts` |
| `DELETE` | `/api/v1/ai/chatbot/documents/:id` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/chatbot/documents/upload` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/chatbot/logs` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/config` | `backend/src/modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/config` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/format-rich` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/providers` | `backend/src/modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/providers/:id` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/providers/:id/models` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/sales-handoff-message` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/sentiment/:id` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/suggest` | `backend/src/modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/summarize/:id` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/usage` | `backend/src/modules/ai/ai-routes.ts` |

## analytics (4)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/analytics/conversion-funnel` | `backend/src/modules/analytics/analytics-routes.ts` |
| `POST` | `/api/v1/analytics/custom` | `backend/src/modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/response-time` | `backend/src/modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/team-performance` | `backend/src/modules/analytics/analytics-routes.ts` |

## appointments (10)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/appointments` | `backend/src/modules/contacts/appointment-routes.ts` |
| `POST` | `/api/v1/appointments` | `backend/src/modules/contacts/appointment-routes.ts` |
| `DELETE` | `/api/v1/appointments/:id` | `backend/src/modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/:id` | `backend/src/modules/contacts/appointment-routes.ts` |
| `PUT` | `/api/v1/appointments/:id` | `backend/src/modules/contacts/appointment-routes.ts` |
| `PATCH` | `/api/v1/appointments/:id/status` | `backend/src/modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/settings` | `backend/src/modules/contacts/appointment-routes.ts` |
| `PUT` | `/api/v1/appointments/settings` | `backend/src/modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/today` | `backend/src/modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/upcoming` | `backend/src/modules/contacts/appointment-routes.ts` |

## audit-logs (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/audit-logs` | `backend/src/modules/auth/user-routes.ts` |

## branding (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/branding` | `backend/src/modules/branding/branding-routes.ts` |

## campaigns (2)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/campaigns/contacts/:contactId/attempts` | `backend/src/modules/campaign/campaign-routes.ts` |
| `POST` | `/api/v1/campaigns/random-friend-request` | `backend/src/modules/campaign/campaign-routes.ts` |

## chat (1)

| Method | Effective path | Source |
|---|---|---|
| `POST` | `/api/v1/chat/send-handoff` | `backend/src/modules/chat/chat-routes.ts` |

## config (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/config` | `backend/src/modules/config/config-routes.ts` |

## contacts (43)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/contacts` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts` | `backend/src/modules/contacts/contact-routes.ts` |
| `PATCH` | `/api/v1/contacts/:contactId/apply-ai-suggestion` | `backend/src/modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/contacts/:contactId/notes` | `backend/src/modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/contacts/:contactId/notes` | `backend/src/modules/contacts/notes-routes.ts` |
| `DELETE` | `/api/v1/contacts/:id` | `backend/src/modules/rbac/rbac-middleware.ts` |
| `DELETE` | `/api/v1/contacts/:id` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id` | `backend/src/modules/contacts/contact-routes.ts` |
| `PUT` | `/api/v1/contacts/:id` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/appointments` | `backend/src/modules/contacts/contact-sub-resource-routes.ts` |
| `GET` | `/api/v1/contacts/:id/cockpit` | `backend/src/modules/contacts/cockpit-routes.ts` |
| `GET` | `/api/v1/contacts/:id/crm-tags` | `backend/src/modules/tags/tag-routes.ts` |
| `POST` | `/api/v1/contacts/:id/crm-tags` | `backend/src/modules/tags/tag-routes.ts` |
| `DELETE` | `/api/v1/contacts/:id/crm-tags/:tagId` | `backend/src/modules/tags/tag-routes.ts` |
| `GET` | `/api/v1/contacts/:id/engagement-timeline` | `backend/src/modules/engagement/engagement-routes.ts` |
| `GET` | `/api/v1/contacts/:id/friendships` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/link-parent` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/merge-into` | `backend/src/modules/contacts/contact-routes.ts` |
| `PUT` | `/api/v1/contacts/:id/tags` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/teammates` | `backend/src/modules/contacts/cockpit-routes.ts` |
| `POST` | `/api/v1/contacts/:id/unlink-parent` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/virtual-conversation` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/address-suggestions` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-friend-display-name` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-global-id` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-missing-friends` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-orphan-friends` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/by-zalo-uid/:uid` | `backend/src/modules/contacts/contact-sub-resource-routes.ts` |
| `GET` | `/api/v1/contacts/duplicates` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/duplicates/:groupId/dismiss` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/duplicates/:groupId/merge` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/export` | `backend/src/modules/contacts/contact-export-routes.ts` |
| `POST` | `/api/v1/contacts/import/commit` | `backend/src/modules/contacts/contact-import-routes.ts` |
| `POST` | `/api/v1/contacts/import/preview` | `backend/src/modules/contacts/contact-import-routes.ts` |
| `POST` | `/api/v1/contacts/intelligence/recompute` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/parent-candidates` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/parent-candidates/:id/accept` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/parent-candidates/:id/dismiss` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/pipeline` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/quick-create` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/resolve-by-keys` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/sources` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/stats` | `backend/src/modules/contacts/contact-routes.ts` |

## conversations (29)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/conversations` | `backend/src/modules/chat/chat-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id` | `backend/src/modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/attachments` | `backend/src/modules/chat/chat-attachment-routes.ts` |
| `POST` | `/api/v1/conversations/:id/card` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/forward` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/link` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/mark-read` | `backend/src/modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id/messages` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages` | `backend/src/modules/chat/chat-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id/messages/:msgId` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/ai-parse-appointment` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/edit` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/undo` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/pin` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id/reactions` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/reactions` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/restore` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/send-block` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/sticker` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `PATCH` | `/api/v1/conversations/:id/tab` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/touch-profile` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/typing` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/unpin` | `backend/src/modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/upload-image` | `backend/src/modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/counts` | `backend/src/modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/ensure-by-uid` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/conversations/event-counts` | `backend/src/modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/sidebar-tags` | `backend/src/modules/chat/chat-routes.ts` |

## crm-tag-groups (4)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/crm-tag-groups` | `backend/src/modules/contacts/crm-tag-group-routes.ts` |
| `POST` | `/api/v1/crm-tag-groups` | `backend/src/modules/contacts/crm-tag-group-routes.ts` |
| `DELETE` | `/api/v1/crm-tag-groups/:id` | `backend/src/modules/contacts/crm-tag-group-routes.ts` |
| `PATCH` | `/api/v1/crm-tag-groups/:id` | `backend/src/modules/contacts/crm-tag-group-routes.ts` |

## crm-tags (5)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/crm-tags` | `backend/src/modules/contacts/crm-tag-routes.ts` |
| `POST` | `/api/v1/crm-tags` | `backend/src/modules/contacts/crm-tag-routes.ts` |
| `DELETE` | `/api/v1/crm-tags/:id` | `backend/src/modules/contacts/crm-tag-routes.ts` |
| `PATCH` | `/api/v1/crm-tags/:id` | `backend/src/modules/contacts/crm-tag-routes.ts` |
| `POST` | `/api/v1/crm-tags/reorder` | `backend/src/modules/contacts/crm-tag-routes.ts` |

## customers (2)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/customers/:id/activity-log` | `backend/src/modules/activity/timeline-routes.ts` |
| `GET` | `/api/v1/customers/:id/timeline` | `backend/src/modules/activity/timeline-routes.ts` |

## dashboard (10)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/dashboard/action-hub/me` | `backend/src/modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/picker/depts` | `backend/src/modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/picker/users` | `backend/src/modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/system` | `backend/src/modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/team` | `backend/src/modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/appointments` | `backend/src/modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/kpi` | `backend/src/modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/message-volume` | `backend/src/modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/pipeline` | `backend/src/modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/sources` | `backend/src/modules/dashboard/dashboard-routes.ts` |

## departments (7)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/departments` | `backend/src/modules/rbac/department-routes.ts` |
| `POST` | `/api/v1/departments` | `backend/src/modules/rbac/department-routes.ts` |
| `DELETE` | `/api/v1/departments/:id` | `backend/src/modules/rbac/department-routes.ts` |
| `PATCH` | `/api/v1/departments/:id` | `backend/src/modules/rbac/department-routes.ts` |
| `POST` | `/api/v1/departments/:id/members` | `backend/src/modules/rbac/department-routes.ts` |
| `GET` | `/api/v1/departments/:id/members-tree` | `backend/src/modules/rbac/department-routes.ts` |
| `DELETE` | `/api/v1/departments/:id/members/:userId` | `backend/src/modules/rbac/department-routes.ts` |

## files (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/files/recordings/*` | `backend/src/app.ts` |

## filter-presets (2)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/filter-presets` | `backend/src/modules/chat/preset-routes.ts` |
| `POST` | `/api/v1/filter-presets` | `backend/src/modules/chat/preset-routes.ts` |

## friends (7)

| Method | Effective path | Source |
|---|---|---|
| `POST` | `/api/v1/friends/:friendId/zalo-label` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `PATCH` | `/api/v1/friends/:id` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/friends/:id/ensure-conversation` | `backend/src/modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/friends/:id/promote-to-parent` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/friends/:id/tags` | `backend/src/modules/tags/tag-routes.ts` |
| `POST` | `/api/v1/friends/:id/tags` | `backend/src/modules/tags/tag-routes.ts` |
| `DELETE` | `/api/v1/friends/:id/tags/:tagId` | `backend/src/modules/tags/tag-routes.ts` |

## friends-db (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/friends-db/all-nicks` | `backend/src/modules/zalo/friend-routes.ts` |

## health (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/health` | `backend/src/app.ts` |

## integrations (6)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/integrations` | `backend/src/modules/integrations/integration-routes.ts` |
| `POST` | `/api/v1/integrations` | `backend/src/modules/integrations/integration-routes.ts` |
| `DELETE` | `/api/v1/integrations/:id` | `backend/src/modules/integrations/integration-routes.ts` |
| `PUT` | `/api/v1/integrations/:id` | `backend/src/modules/integrations/integration-routes.ts` |
| `GET` | `/api/v1/integrations/:id/logs` | `backend/src/modules/integrations/integration-routes.ts` |
| `POST` | `/api/v1/integrations/:id/sync` | `backend/src/modules/integrations/integration-routes.ts` |

## leads (2)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/leads/stuck` | `backend/src/modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/leads/stuck/scan` | `backend/src/modules/scoring/scoring-routes.ts` |

## me (12)

| Method | Effective path | Source |
|---|---|---|
| `POST` | `/api/v1/me/avatar` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/change-password` | `backend/src/modules/auth/user-routes.ts` |
| `GET` | `/api/v1/me/internal-contact` | `backend/src/modules/auth/user-routes.ts` |
| `GET` | `/api/v1/me/onboarding` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/dismiss` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/reopen` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/skip-step` | `backend/src/modules/auth/user-routes.ts` |
| `GET` | `/api/v1/me/preferences` | `backend/src/modules/auth/user-preference-routes.ts` |
| `DELETE` | `/api/v1/me/preferences/:key` | `backend/src/modules/auth/user-preference-routes.ts` |
| `GET` | `/api/v1/me/preferences/:key` | `backend/src/modules/auth/user-preference-routes.ts` |
| `PUT` | `/api/v1/me/preferences/:key` | `backend/src/modules/auth/user-preference-routes.ts` |
| `PATCH` | `/api/v1/me/profile` | `backend/src/modules/auth/user-routes.ts` |

## media (24)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/media` | `backend/src/modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id` | `backend/src/modules/media/media-routes.ts` |
| `PATCH` | `/api/v1/media/:id` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/favorite` | `backend/src/modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id/permanent` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/restore` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/send` | `backend/src/modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id/watermark` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/watermark` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/album/send` | `backend/src/modules/media/media-routes.ts` |
| `PATCH` | `/api/v1/media/bulk` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/download` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/favorites` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/folders` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/folders` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/save-from-chat` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/save-from-chat-batch` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/stats` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/suggest` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/tags` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/trash` | `backend/src/modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/trash/empty` | `backend/src/modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/upload` | `backend/src/modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/uploaders` | `backend/src/modules/media/media-routes.ts` |

## messages (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/messages/:id` | `backend/src/modules/rbac/rbac-middleware.ts` |

## notes (5)

| Method | Effective path | Source |
|---|---|---|
| `DELETE` | `/api/v1/notes/:id` | `backend/src/modules/contacts/notes-routes.ts` |
| `PATCH` | `/api/v1/notes/:id` | `backend/src/modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/ai-parse` | `backend/src/modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/link-appointment` | `backend/src/modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/reactions` | `backend/src/modules/contacts/notes-routes.ts` |

## notifications (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/notifications` | `backend/src/modules/notifications/notification-routes.ts` |

## organization (5)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/organization` | `backend/src/modules/auth/org-routes.ts` |
| `PUT` | `/api/v1/organization` | `backend/src/modules/auth/org-routes.ts` |
| `GET` | `/api/v1/organization/automation-settings` | `backend/src/modules/auth/org-routes.ts` |
| `PUT` | `/api/v1/organization/automation-settings` | `backend/src/modules/auth/org-routes.ts` |
| `PATCH` | `/api/v1/organization/system-notify-nick` | `backend/src/modules/auth/org-routes.ts` |

## permission-groups (6)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/permission-groups` | `backend/src/modules/rbac/permission-group-routes.ts` |
| `POST` | `/api/v1/permission-groups` | `backend/src/modules/rbac/permission-group-routes.ts` |
| `DELETE` | `/api/v1/permission-groups/:id` | `backend/src/modules/rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/permission-groups/:id` | `backend/src/modules/rbac/permission-group-routes.ts` |
| `PATCH` | `/api/v1/permission-groups/:id` | `backend/src/modules/rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/permission-groups/meta` | `backend/src/modules/rbac/permission-group-routes.ts` |

## privacy (6)

| Method | Effective path | Source |
|---|---|---|
| `POST` | `/api/v1/privacy/lock` | `backend/src/modules/privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/my-nicks` | `backend/src/modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/otp/request` | `backend/src/modules/privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/otp/status` | `backend/src/modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/otp/verify` | `backend/src/modules/privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/status` | `backend/src/modules/privacy/privacy-routes.ts` |

## profile (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/profile` | `backend/src/modules/auth/auth-routes.ts` |

## public (12)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/public/appointments` | `backend/src/modules/api/public-api-routes.ts` |
| `POST` | `/api/public/appointments` | `backend/src/modules/api/public-api-routes.ts` |
| `GET` | `/api/public/appointments/action` | `backend/src/modules/contacts/appointment-public-routes.ts` |
| `POST` | `/api/public/appointments/action` | `backend/src/modules/contacts/appointment-public-routes.ts` |
| `GET` | `/api/public/contacts` | `backend/src/modules/api/public-api-routes.ts` |
| `POST` | `/api/public/contacts` | `backend/src/modules/api/public-api-routes.ts` |
| `GET` | `/api/public/contacts/:id` | `backend/src/modules/api/public-api-routes.ts` |
| `PUT` | `/api/public/contacts/:id` | `backend/src/modules/api/public-api-routes.ts` |
| `GET` | `/api/public/conversations` | `backend/src/modules/api/public-api-routes.ts` |
| `GET` | `/api/public/conversations/:id/messages` | `backend/src/modules/api/public-api-routes.ts` |
| `POST` | `/api/public/messages/send` | `backend/src/modules/api/public-api-routes.ts` |
| `GET` | `/api/v1/public/org-branding` | `backend/src/modules/branding/org-branding-routes.ts` |

## public-action (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/a/:code` | `backend/src/modules/contacts/appointment-public-routes.ts` |

## rbac (2)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/rbac/users` | `backend/src/modules/rbac/user-assignment-routes.ts` |
| `PATCH` | `/api/v1/rbac/users/:id/permission-group` | `backend/src/modules/rbac/user-assignment-routes.ts` |

## reports (13)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/reports/appointments` | `backend/src/modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/audit` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/automation` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/contacts` | `backend/src/modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/crm-usage` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/engagement` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/export` | `backend/src/modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/lead-pool` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/messages` | `backend/src/modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/nick-fleet` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/overview` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/pipeline` | `backend/src/modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/sales-performance` | `backend/src/modules/dashboard/report-analytics-routes.ts` |

## saved-reports (6)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/saved-reports` | `backend/src/modules/analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports` | `backend/src/modules/analytics/saved-report-routes.ts` |
| `DELETE` | `/api/v1/saved-reports/:id` | `backend/src/modules/analytics/saved-report-routes.ts` |
| `GET` | `/api/v1/saved-reports/:id` | `backend/src/modules/analytics/saved-report-routes.ts` |
| `PUT` | `/api/v1/saved-reports/:id` | `backend/src/modules/analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports/:id/run` | `backend/src/modules/analytics/saved-report-routes.ts` |

## scoring (8)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/scoring/config` | `backend/src/modules/scoring/scoring-routes.ts` |
| `PUT` | `/api/v1/scoring/config` | `backend/src/modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/nba-templates` | `backend/src/modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/recompute-all` | `backend/src/modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/rules` | `backend/src/modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/seed-defaults` | `backend/src/modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/stage-transitions` | `backend/src/modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/stuck-thresholds` | `backend/src/modules/scoring/scoring-routes.ts` |

## search (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/search` | `backend/src/modules/search/search-routes.ts` |

## settings (10)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/settings/api-key` | `backend/src/modules/api/webhook-settings-routes.ts` |
| `POST` | `/api/v1/settings/api-key/generate` | `backend/src/modules/api/webhook-settings-routes.ts` |
| `GET` | `/api/v1/settings/statuses` | `backend/src/modules/contacts/status-routes.ts` |
| `POST` | `/api/v1/settings/statuses` | `backend/src/modules/contacts/status-routes.ts` |
| `DELETE` | `/api/v1/settings/statuses/:id` | `backend/src/modules/contacts/status-routes.ts` |
| `PUT` | `/api/v1/settings/statuses/:id` | `backend/src/modules/contacts/status-routes.ts` |
| `POST` | `/api/v1/settings/statuses/reorder` | `backend/src/modules/contacts/status-routes.ts` |
| `GET` | `/api/v1/settings/webhook` | `backend/src/modules/api/webhook-settings-routes.ts` |
| `PUT` | `/api/v1/settings/webhook` | `backend/src/modules/api/webhook-settings-routes.ts` |
| `POST` | `/api/v1/settings/webhook/test` | `backend/src/modules/api/webhook-settings-routes.ts` |

## setup (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/setup/status` | `backend/src/modules/auth/auth-routes.ts` |

## status (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/status` | `backend/src/app.ts` |

## system-notifications (14)

| Method | Effective path | Source |
|---|---|---|
| `POST` | `/api/v1/system-notifications/compile-template` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/logs` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/logs/:id/retry` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/org-config` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/org-config` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/preview-welcome` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/recipients` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/recipients/:userId/check-live` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/recipients/health` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/recipients/recheck-all` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/settings` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/settings/sender` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/test` | `backend/src/modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/welcome-image` | `backend/src/modules/system-notifications/system-notify-routes.ts` |

## tags (6)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/tags` | `backend/src/modules/tags/tag-routes.ts` |
| `POST` | `/api/v1/tags` | `backend/src/modules/tags/tag-routes.ts` |
| `DELETE` | `/api/v1/tags/:id` | `backend/src/modules/tags/tag-routes.ts` |
| `PATCH` | `/api/v1/tags/:id` | `backend/src/modules/tags/tag-routes.ts` |
| `POST` | `/api/v1/tags/merge` | `backend/src/modules/tags/tag-routes.ts` |
| `GET` | `/api/v1/tags/zalo-accounts` | `backend/src/modules/tags/tag-routes.ts` |

## teams (7)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/teams` | `backend/src/modules/auth/team-routes.ts` |
| `POST` | `/api/v1/teams` | `backend/src/modules/auth/team-routes.ts` |
| `DELETE` | `/api/v1/teams/:id` | `backend/src/modules/auth/team-routes.ts` |
| `PUT` | `/api/v1/teams/:id` | `backend/src/modules/auth/team-routes.ts` |
| `GET` | `/api/v1/teams/:id/members` | `backend/src/modules/auth/team-routes.ts` |
| `POST` | `/api/v1/teams/:id/members` | `backend/src/modules/auth/team-routes.ts` |
| `DELETE` | `/api/v1/teams/:id/members/:userId` | `backend/src/modules/auth/team-routes.ts` |

## telegram-bridge (4)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/telegram-bridge/:zaloAccountId/status` | `backend/src/modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/disable/:zaloAccountId` | `backend/src/modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/link-code` | `backend/src/modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/provision/:zaloAccountId` | `backend/src/modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |

## telephony (13)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/telephony/calls` | `backend/src/modules/telephony/telephony-routes.ts` |
| `POST` | `/api/v1/telephony/calls` | `backend/src/modules/telephony/telephony-routes.ts` |
| `PATCH` | `/api/v1/telephony/calls/:id` | `backend/src/modules/telephony/telephony-routes.ts` |
| `GET` | `/api/v1/telephony/calls/:id/notes` | `backend/src/modules/telephony/telephony-routes.ts` |
| `POST` | `/api/v1/telephony/calls/:id/notes` | `backend/src/modules/telephony/telephony-routes.ts` |
| `GET` | `/api/v1/telephony/calls/:id/recording` | `backend/src/modules/telephony/telephony-routes.ts` |
| `GET` | `/api/v1/telephony/contacts/:contactId/latest-call` | `backend/src/modules/telephony/telephony-routes.ts` |
| `GET` | `/api/v1/telephony/dial-suggestions` | `backend/src/modules/telephony/telephony-routes.ts` |
| `GET` | `/api/v1/telephony/omicall/available-extensions` | `backend/src/modules/telephony/telephony-routes.ts` |
| `GET` | `/api/v1/telephony/omicall/connect-config` | `backend/src/modules/telephony/telephony-routes.ts` |
| `POST` | `/api/v1/telephony/omicall/events` | `backend/src/modules/telephony/omicall-public-routes.ts` |
| `POST` | `/api/v1/telephony/omicall/resolve-conversation-target` | `backend/src/modules/telephony/telephony-routes.ts` |
| `POST` | `/api/v1/telephony/omicall/sync` | `backend/src/modules/telephony/telephony-routes.ts` |

## timeline (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/timeline/export` | `backend/src/modules/activity/timeline-routes.ts` |

## users (13)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/users` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users` | `backend/src/modules/auth/user-routes.ts` |
| `DELETE` | `/api/v1/users/:id` | `backend/src/modules/auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users/:id/handoff` | `backend/src/modules/auth/user-routes.ts` |
| `PATCH` | `/api/v1/users/:id/max-privacy-nicks` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users/:id/omicall-auto-provision` | `backend/src/modules/auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id/omicall-extension` | `backend/src/modules/auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id/password` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users/:userId/resend-credentials` | `backend/src/modules/system-notifications/user-create-with-zalo-routes.ts` |
| `POST` | `/api/v1/users/bulk-assign` | `backend/src/modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users/check-zalo-by-phone` | `backend/src/modules/system-notifications/user-create-with-zalo-routes.ts` |
| `POST` | `/api/v1/users/create-with-zalo` | `backend/src/modules/system-notifications/user-create-with-zalo-routes.ts` |

## zalo-accounts (22)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/zalo-accounts` | `backend/src/modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:accountId/groups/:groupId/ensure-conversation` | `backend/src/modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/access` | `backend/src/modules/zalo/zalo-access-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/access` | `backend/src/modules/zalo/zalo-access-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/access/:accessId` | `backend/src/modules/zalo/zalo-access-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/access/:accessId` | `backend/src/modules/zalo/zalo-access-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/labels` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/labels/:labelId` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/assign-thread` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/sync` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/touch` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/privacy-mode` | `backend/src/modules/privacy/privacy-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/sdk-limits` | `backend/src/modules/zalo/zalo-dashboard-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/sdk-limits` | `backend/src/modules/zalo/zalo-dashboard-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-contacts` | `backend/src/modules/zalo/zalo-sync-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-history` | `backend/src/modules/zalo/zalo-sync-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/archived` | `backend/src/modules/zalo/zalo-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/enriched` | `backend/src/modules/zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/labels-overview` | `backend/src/modules/zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/sdk-limits` | `backend/src/modules/zalo/zalo-dashboard-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/sdk-limits/org` | `backend/src/modules/zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/stats` | `backend/src/modules/zalo/zalo-dashboard-routes.ts` |

## zalo-bankcard (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/zalo-bankcard` | `backend/src/modules/contacts/zinstant-proxy-routes.ts` |

## zalo-sticker (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/zalo-sticker/:catId/:id` | `backend/src/modules/contacts/zinstant-proxy-routes.ts` |

## zalo-sticker-list (1)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/zalo-sticker-list` | `backend/src/modules/contacts/zinstant-proxy-routes.ts` |

## zalo-user-info (3)

| Method | Effective path | Source |
|---|---|---|
| `GET` | `/api/v1/zalo-user-info/:uid` | `backend/src/modules/contacts/zinstant-proxy-routes.ts` |
| `POST` | `/api/v1/zalo-user-info/batch` | `backend/src/modules/contacts/zinstant-proxy-routes.ts` |
| `POST` | `/api/v1/zalo-user-info/find-by-phone` | `backend/src/modules/contacts/zinstant-proxy-routes.ts` |

## Quy trình kiểm một endpoint

1. Mở source được ghi, xác định auth/preHandler và tenant/Zalo scope.
2. Kiểm validation của params/query/body, size/rate limit và error mapping.
3. Trace service/Prisma/Socket.IO/job/vendor side effects và idempotency.
4. Test anonymous, thiếu grant, wrong owner/org/Zalo account, success và retry/concurrency.
5. Nếu đổi contract, cập nhật catalog hoặc cách sinh, feature/integration doc và client tương ứng.

Legacy API documentation hơn 2.700 dòng vẫn nằm archive để tra ví dụ/history, nhưng token TTL, endpoint, schema và permission có thể drift. Không copy credential/base domain ví dụ sang production.

