// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-directory.ts — read-only lookup of extensions already provisioned on
 * the OmiCall Call Center dashboard, so admins can ASSIGN an existing extension
 * to a CRM user by picking from a list instead of typing sip_user/password by
 * hand.
 *
 * CORRECTION 2026-08-19: this file previously claimed "OmiCall has no
 * documented API to create extensions" — that was wrong, based on checking
 * only the Call Center (/api/call_center/internal_phone/*) doc family and
 * missing the separate Employee (/api/agent/*) doc family. OmiCall DOES have
 * a create-employee API (POST /api/agent/invite, see omicall-agent-provisioning.ts)
 * which returns a real sip_user/password. This file's listUnassignedOmicallExtensions
 * remains useful for assigning extensions created out-of-band (dashboard or
 * legacy agents), but new employees should go through the invite flow instead.
 *
 * Auth: Call Center endpoints need a Bearer access_token (GET /api/auth?apiKey=),
 * unlike Call Transaction/Contact APIs elsewhere in this module which use
 * x-api-key directly. Token cached in-memory (~24h lifetime per OmiCall docs,
 * refreshed with a safety margin) — module-level cache is fine here since this
 * is a low-frequency admin action, not a hot path.
 */
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface OmicallDirectoryExtension {
  sipUser: string;
  password: string;
  fullName: string;
  email: string;
  domain: string;
  agentId: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
const TOKEN_SAFETY_MARGIN_MS = 60 * 60 * 1000; // refresh 1h before assumed 24h expiry
const ASSUMED_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Shared with omicall-agent-provisioning.ts — one module-level token cache for all OmiCall Bearer-auth calls. */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const res = await fetch(`${config.omicallApiBaseUrl}/api/auth?apiKey=${encodeURIComponent(config.omicallApiKey)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`OmiCall auth failed: HTTP ${res.status}`);
  const body = await res.json() as { payload?: { access_token?: string }; status_code?: number };
  const token = body?.payload?.access_token;
  if (!token) throw new Error('OmiCall auth: missing access_token in response');
  cachedToken = { token, expiresAt: Date.now() + ASSUMED_TOKEN_TTL_MS - TOKEN_SAFETY_MARGIN_MS };
  return token;
}

/**
 * List extensions provisioned on OmiCall that are NOT yet linked to any active
 * user in this org (by sip_user). Never logs the plaintext password.
 */
export async function listUnassignedOmicallExtensions(orgId: string): Promise<OmicallDirectoryExtension[]> {
  if (!config.omicallEnabled || !config.omicallApiKey) {
    throw new Error('OmiCall chưa được cấu hình (thiếu OMICALL_API_KEY)');
  }
  const token = await getAccessToken();
  const res = await fetch(`${config.omicallApiBaseUrl}/api/call_center/internal_phone/list`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`OmiCall internal_phone/list failed: HTTP ${res.status}`);
  const body = await res.json() as {
    payload?: { items?: Array<{ sip_user: string; password: string; full_name: string; email: string; domain: string; agent_id: string; enabled?: boolean }> };
  };
  const items = body?.payload?.items ?? [];

  const assigned = await prisma.user.findMany({
    where: { orgId, omicallExtension: { not: null } },
    select: { omicallExtension: true },
  });
  const assignedSet = new Set(assigned.map((u) => u.omicallExtension));

  const unassigned = items
    .filter((item) => item.enabled !== false && !assignedSet.has(item.sip_user))
    .map((item) => ({
      sipUser: item.sip_user,
      password: item.password,
      fullName: item.full_name,
      email: item.email,
      domain: item.domain,
      agentId: item.agent_id,
    }));

  logger.info(`[omicall-directory] org=${orgId} total=${items.length} unassigned=${unassigned.length}`);
  return unassigned;
}

/** Best-effort enable/disable an extension on OmiCall. Never throws — caller decides how to surface failure. */
export async function setOmicallExtensionEnabled(sipUser: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${config.omicallApiBaseUrl}/api/call_center/internal_phone/status?enabled=${enabled}&sip_user=${encodeURIComponent(sipUser)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[omicall-directory] setOmicallExtensionEnabled(${sipUser}, ${enabled}) failed: ${message}`);
    return { ok: false, error: message };
  }
}
