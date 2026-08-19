// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-agent-provisioning.ts — auto-create a real OmiCall employee (agent)
 * whenever a CRM user is created, so calling works without any manual
 * extension setup. Uses POST /api/agent/invite (confirmed live, doc family
 * /omicall-api/nhan-vien — see omicall-directory.ts header for the earlier
 * mistake of missing this endpoint family).
 *
 * Best-effort by design: this must never block or fail CRM user creation.
 * Callers should await it but treat a failed result as "user created,
 * calling not yet available" — never rethrow into the user-creation flow.
 */
import { randomBytes } from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { getAccessToken } from './omicall-directory.js';
import { encryptOmicallSecret } from './omicall-token.js';

export interface ProvisionOmicallAgentInput {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string;
}

export interface ProvisionOmicallAgentResult {
  ok: boolean;
  sipUser?: string;
  sipPasswordEncrypted?: string;
  domain?: string;
  reused?: boolean; // true if we attached to a pre-existing OmiCall agent instead of creating a new one
  error?: string;
}

const ROLE_NAME = 'Sale'; // tentative: default every new CRM user to least-privilege OmiCall role; revisit if a role-mapping need shows up

/** OmiCall password rule: min 8 chars, upper + lower + digit + special. Independent from the CRM login password on purpose. */
function generateOmicallPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digit + special;
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digit), pick(special)];
  for (let i = chars.length; i < 12; i++) chars.push(pick(all));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * identify_info is required and must look like an email. Most CRM users here
 * are phone-first with no email on file — OmiCall's docs only say "email
 * identifier", with no stated requirement that it be a deliverable address,
 * so a synthetic-but-valid-format placeholder is used when no real email exists.
 */
function buildIdentifyInfo(email: string | null, phone: string): string {
  if (email) return email;
  return `zalo${phone}@no-email.zalo-crm-solar.local`;
}

async function lookupExistingAgentByEmail(identifyInfo: string, token: string): Promise<{ sipUser: string; sipPassword: string; domain?: string } | null> {
  const res = await fetch(`${config.omicallApiBaseUrl}/api/v2/agent/get-by-email`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: identifyInfo }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    payload?: { pbx_account?: { sip_user?: string; sip_password?: string; domain?: string } };
  } | null;
  const pbx = body?.payload?.pbx_account;
  if (!pbx?.sip_user || !pbx?.sip_password) return null;
  return { sipUser: pbx.sip_user, sipPassword: pbx.sip_password, domain: pbx.domain };
}

export async function provisionOmicallAgent(input: ProvisionOmicallAgentInput): Promise<ProvisionOmicallAgentResult> {
  if (!config.omicallEnabled || !config.omicallApiKey) {
    return { ok: false, error: 'omicall_disabled' };
  }

  const identifyInfo = buildIdentifyInfo(input.email, input.phone);
  const password = generateOmicallPassword();

  try {
    const token = await getAccessToken();

    const res = await fetch(`${config.omicallApiBaseUrl}/api/agent/invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: input.fullName,
        identify_info: identifyInfo,
        password,
        role_name: ROLE_NAME,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await res.json().catch(() => null)) as {
      payload?: { pbx_account?: { sip_user?: string; password?: string; domain?: string } };
      error?: string;
      message?: string;
    } | null;

    if (res.ok && body?.payload?.pbx_account?.sip_user) {
      const pbx = body.payload.pbx_account;
      const sipPassword = pbx.password || password;
      logger.info(`[omicall-agent-provisioning] created agent for user=${input.userId} sip_user=${pbx.sip_user}`);
      return {
        ok: true,
        sipUser: pbx.sip_user,
        sipPasswordEncrypted: encryptOmicallSecret(sipPassword),
        domain: pbx.domain,
      };
    }

    const errorCode = body?.error || body?.message || `HTTP ${res.status}`;

    if (errorCode === 'agent_exists') {
      logger.warn(`[omicall-agent-provisioning] agent_exists for identify_info=${identifyInfo}, trying lookup`);
      const existing = await lookupExistingAgentByEmail(identifyInfo, token);
      if (existing) {
        logger.info(`[omicall-agent-provisioning] reused existing agent for user=${input.userId} sip_user=${existing.sipUser}`);
        return {
          ok: true,
          sipUser: existing.sipUser,
          sipPasswordEncrypted: encryptOmicallSecret(existing.sipPassword),
          domain: existing.domain,
          reused: true,
        };
      }
    }

    logger.warn(`[omicall-agent-provisioning] invite failed for user=${input.userId}: ${errorCode}`);
    return { ok: false, error: errorCode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[omicall-agent-provisioning] invite threw for user=${input.userId}: ${message}`);
    return { ok: false, error: message };
  }
}
