// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { classifyZaloConnectionError } from '../src/modules/zalo/zalo-connection-error.js';

describe('classifyZaloConnectionError', () => {
  it.each([
    ['KICKOUT_BY_WORKER', 'session_conflict'],
    ['cookie expired', 'session_expired'],
    ['ZcaApiError Đăng nhập thất bại', 'session_expired'],
    ['Proxy Authentication Required (407)', 'proxy_error'],
    ['fetch failed: ETIMEDOUT', 'network_error'],
    ['provider returned an unknown response', 'reconnect_failed'],
  ])('classifies %s', (message, code) => {
    expect(classifyZaloConnectionError(new Error(message)).code).toBe(code);
  });

  it('redacts credential-like values before logging', () => {
    const issue = classifyZaloConnectionError(new Error('cookie=secret token:abc123 invalid cookie'));
    expect(issue.safeLogMessage).not.toContain('secret');
    expect(issue.safeLogMessage).not.toContain('abc123');
  });
});
