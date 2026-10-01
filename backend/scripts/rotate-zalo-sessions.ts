// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Re-encrypt every saved Zalo session with the active ZALO_SESSION_ENCRYPTION_KEY.
 *
 * Safe rollout:
 *   1. Set ZALO_SESSION_ENCRYPTION_KEY to the new key and
 *      ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS to the old Zalo session key.
 *   2. Run without --apply (dry-run) and inspect the report.
 *   3. Run with --apply. Any decryption failure aborts before writing.
 *   4. Verify reconnect/export and then remove ENCRYPTION_KEY_PREVIOUS.
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { runSystemQuery } from '../src/shared/tenant/tenant-context.js';
import {
  decryptZaloSession,
  encryptZaloSession,
  isZaloSessionUsingCurrentKey,
} from '../src/modules/zalo/zalo-session-crypto.js';
import { config } from '../src/config/index.js';

type SessionRow = { id: string; orgId: string; displayName: string | null; sessionData: unknown };

async function loadRows(): Promise<SessionRow[]> {
  return runSystemQuery(() => prisma.zaloAccount.findMany({
    where: { sessionData: { not: null } },
    select: { id: true, orgId: true, displayName: true, sessionData: true },
    orderBy: { id: 'asc' },
  })) as Promise<SessionRow[]>;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!config.zaloSessionEncryptionKeyPrevious) {
    throw new Error('ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS must be set during key rotation; refusing to continue');
  }
  if (config.zaloSessionEncryptionKeyPrevious === config.zaloSessionEncryptionKey) {
    throw new Error('ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS must differ from ZALO_SESSION_ENCRYPTION_KEY');
  }

  const rows = await loadRows();
  const plans: Array<{ row: SessionRow; encrypted: ReturnType<typeof encryptZaloSession> }> = [];
  let alreadyCurrent = 0;

  for (const row of rows) {
    if (isZaloSessionUsingCurrentKey(row.sessionData)) {
      alreadyCurrent += 1;
      continue;
    }
    const credentials = decryptZaloSession(row.sessionData);
    if (!credentials) throw new Error(`Invalid Zalo session data: account=${row.id}`);
    plans.push({ row, encrypted: encryptZaloSession(credentials) });
  }

  console.log(`[zalo-session-rotate] total=${rows.length} alreadyCurrent=${alreadyCurrent} pending=${plans.length} mode=${apply ? 'APPLY' : 'DRY-RUN'}`);
  if (!apply) {
    for (const { row } of plans) console.log(`  would rotate account=${row.id} org=${row.orgId} name=${row.displayName ?? '(unnamed)'}`);
    return;
  }

  for (const { row, encrypted } of plans) {
    await runSystemQuery(() => prisma.zaloAccount.update({
      where: { id: row.id },
      data: { sessionData: encrypted as any },
    }));
    console.log(`  rotated account=${row.id}`);
  }
  console.log(`[zalo-session-rotate] completed=${plans.length}`);
}

main()
  .catch((err) => {
    console.error(`[zalo-session-rotate] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
