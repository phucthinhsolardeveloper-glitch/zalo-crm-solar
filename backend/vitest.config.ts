import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 2026-06-11 — DATABASE_URL giả để test UNIT (hàm thuần) import được prisma-client
    // mà không cần DB thật (prisma init lazy, không connect). Test cần DB thật override
    // qua env runtime. Đảm bảo privacy-redact-regression chạy ở mọi máy/CI.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
      // 2026-07-25 — ENCRYPTION_KEY giả (64-hex hợp lệ) để test aes-gcm.ts (Omicall
      // extension secret) không rơi vào dev fallback 'dev-key-change-me-16b', vốn
      // ngắn hơn 32 byte và bị getKey() reject.
      ENCRYPTION_KEY:
        process.env.ENCRYPTION_KEY ?? '0d9a0944426406e35da44b53779935aa27f286368d99007f31d7fb325b313bca',
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/shared/**/*.ts'],
    },
  },
});
