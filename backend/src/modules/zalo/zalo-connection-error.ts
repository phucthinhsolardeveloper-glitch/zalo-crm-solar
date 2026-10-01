// SPDX-License-Identifier: AGPL-3.0-or-later

export type ZaloConnectionIssueCode =
  | 'session_conflict'
  | 'session_expired'
  | 'proxy_error'
  | 'network_error'
  | 'reconnect_failed';

export interface ZaloConnectionIssue {
  code: ZaloConnectionIssueCode;
  userMessage: string;
  safeLogMessage: string;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return [error.name, error.message, cause instanceof Error ? cause.message : cause]
      .filter(Boolean)
      .join(' ');
  }
  return String(error ?? 'Unknown reconnect error');
}

function redact(value: string): string {
  return value
    .replace(/(cookie|token|authorization|session)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

/** Convert provider errors into stable business reasons without exposing secrets. */
export function classifyZaloConnectionError(error: unknown): ZaloConnectionIssue {
  const raw = errorText(error);
  const text = raw.toLowerCase();
  const safeLogMessage = redact(raw);

  if (/kickout_by_worker|kickout|logged in elsewhere|another (web )?session|another device/.test(text)) {
    return {
      code: 'session_conflict',
      userMessage: 'Phiên CRM đã bị một phiên Zalo Web/Desktop khác thay thế. Hãy đóng phiên Web/Desktop rồi quét QR lại.',
      safeLogMessage,
    };
  }
  if (/session expired|session has expired|not logged in|login required|login failed|đăng nhập thất bại|cookie (expired|invalid)|invalid cookie|invalid session|unauthorized|auth(?:entication)? failed/.test(text)) {
    return {
      code: 'session_expired',
      userMessage: 'Phiên đăng nhập Zalo đã hết hạn hoặc không còn hợp lệ. Cần quét QR lại.',
      safeLogMessage,
    };
  }
  if (/proxy|proxy authentication|status 407|tunnel/.test(text)) {
    return {
      code: 'proxy_error',
      userMessage: 'Không kết nối được qua proxy của nick Zalo. Hãy kiểm tra proxy rồi thử lại.',
      safeLogMessage,
    };
  }
  if (/fetch failed|socket|econnreset|econnrefused|etimedout|timeout|enotfound|dns|network/.test(text)) {
    return {
      code: 'network_error',
      userMessage: 'Không thể kết nối tới Zalo do lỗi mạng tạm thời. Hãy kiểm tra mạng/proxy rồi thử lại.',
      safeLogMessage,
    };
  }
  return {
    code: 'reconnect_failed',
    userMessage: 'Không thể khôi phục phiên Zalo đã lưu. Hãy quét QR lại; quản trị viên có thể xem mã lỗi trong log.',
    safeLogMessage,
  };
}
