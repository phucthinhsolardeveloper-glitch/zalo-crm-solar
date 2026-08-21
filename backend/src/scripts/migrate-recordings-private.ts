// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * One-off, idempotent security migration for legacy public call recordings.
 *
 * Run inside the app environment after deploying the encrypted-recording code:
 *   node dist/scripts/migrate-recordings-private.js
 */
import { prisma } from '../shared/database/prisma-client.js';
import { deleteObject, getObjectBuffer, keyFromPublicUrl } from '../shared/storage/minio-client.js';
import { isPrivateRecordingReference, storePrivateRecording } from '../modules/telephony/recording-storage.js';

async function legacyUrlReferenceCount(url: string): Promise<number> {
  const media = await prisma.mediaBlob.count({ where: { publicUrl: url } });
  const messageRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM messages
    WHERE content = ${url}
       OR original_content = ${url}
       OR attachments::text LIKE ${`%${url}%`}
  `;
  return media + Number(messageRows[0]?.count || 0n);
}

async function main(): Promise<void> {
  const calls = await prisma.telephonyCall.findMany({
    where: { provider: 'omicall', recordingId: { not: null } },
    select: { id: true, recordingId: true },
  });

  let migrated = 0;
  let skipped = 0;
  let removedLegacy = 0;
  for (const call of calls) {
    const reference = call.recordingId!;
    if (isPrivateRecordingReference(reference)) {
      skipped += 1;
      continue;
    }
    const legacyKey = keyFromPublicUrl(reference);
    if (!legacyKey) {
      // Provider URL: keep it so a later OmiCall history sync can retry mirroring.
      skipped += 1;
      continue;
    }
    const plain = await getObjectBuffer(legacyKey);
    if (!plain) throw new Error(`legacy recording object missing for call ${call.id}: ${legacyKey}`);
    const privateReference = await storePrivateRecording(plain);
    await prisma.telephonyCall.update({ where: { id: call.id }, data: { recordingId: privateReference } });
    migrated += 1;

    const remainingCalls = await prisma.telephonyCall.count({ where: { recordingId: reference } });
    const otherReferences = await legacyUrlReferenceCount(reference);
    if (remainingCalls === 0 && otherReferences === 0 && await deleteObject(legacyKey)) removedLegacy += 1;
  }

  console.log(JSON.stringify({ scanned: calls.length, migrated, skipped, removedLegacy }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
