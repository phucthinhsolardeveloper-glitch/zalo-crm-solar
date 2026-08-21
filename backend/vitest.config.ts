import { defineConfig } from 'vitest/config';

const removedEditionTests = [
  // Automation/lead-pool lived in the former EE bundle. Keeping these files in
  // the repository is useful as migration history, but they are not runnable
  // against the Community source tree.
  'tests/alias-template.test.ts',
  'tests/block-logger.test.ts',
  'tests/block-reason-catalog.test.ts',
  'tests/block-types.test.ts',
  'tests/care-notify-privacy.test.ts',
  'tests/care-session-service.test.ts',
  'tests/engine-gates.test.ts',
  'tests/lead-notify.test.ts',
  'tests/lead-pool-submit-note.test.ts',
  'tests/materialize-from-event.test.ts',
  'tests/quota-kind-separation.test.ts',
  'tests/reconcile-stuck-steps.test.ts',
  'tests/regression-m51-4-dup-status.test.ts',
  'tests/regression-m52-reply-pause.test.ts',
  'tests/regression-m57-reaction.test.ts',
  'tests/render-template-vars.test.ts',
  'tests/sequence-jobid-multistream.test.ts',
  'tests/sequence-schedule-calculator.test.ts',
  'tests/sequence-step-worker-block.test.ts',
  'tests/sequence-types.test.ts',
  'tests/trigger-types.test.ts',
  'tests/worker-token-passthrough.test.ts',
  // Removed Facebook Lead Ads/Zalo Ads provider implementations.
  'tests/security/hmac.test.ts',
  'tests/unit/facebook-*.test.ts',
  'tests/unit/lead-field-mapper.test.ts',
  'tests/unit/round-robin-assigner.test.ts',
  'tests/unit/zalo-field-mapper.test.ts',
];

const databaseIntegrationTests = [
  'tests/security/ai-capabilities.test.ts',
  'tests/security/auth-flow.test.ts',
  'tests/security/refresh-token-service.test.ts',
  'tests/security/require-active-user.test.ts',
  'tests/security/security-audit.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      ...removedEditionTests,
      // These suites create/delete real rows. Run them explicitly in CI or a
      // disposable database with RUN_DB_TESTS=true; a fake DATABASE_URL must
      // never turn normal unit-test runs red in beforeAll/afterAll hooks.
      ...(process.env.RUN_DB_TESTS === 'true' ? [] : databaseIntegrationTests),
    ],
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
