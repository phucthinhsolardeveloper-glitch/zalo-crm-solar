// SPDX-License-Identifier: AGPL-3.0-or-later

// One-shot bridge between entry points and the lazy/teleported quick-add dialog.
// Module state is shared by Vite chunks; consume clears it to prevent stale data.
let stagedPhone = '';

export function stageQuickAddPhone(phone: string) {
  stagedPhone = phone.trim();
}

export function consumeQuickAddPhone(): string {
  const phone = stagedPhone;
  stagedPhone = '';
  return phone;
}
