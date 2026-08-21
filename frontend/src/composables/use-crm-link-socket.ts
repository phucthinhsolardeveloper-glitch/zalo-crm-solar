// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Socket } from 'socket.io-client';
import { onMounted, onUnmounted } from 'vue';
import { createAppSocket } from '@/api/socket';

export interface ContactChangedEvent {
  contactId: string;
  kind: 'created' | 'updated';
}

export interface CallContactLinkedEvent {
  contactId: string;
  callIds: string[];
}

export interface TelephonyCallChangedEvent {
  callIds: string[];
  status?: string;
}

let socket: Socket | null = null;

function ensureSocket(): Socket {
  if (!socket) socket = createAppSocket();
  return socket;
}

/** Kết nối realtime nhẹ giữa Contacts, Call History và Chat/contact workflows. */
export function useCrmLinkSocket(handlers: {
  onContactChanged?: (event: ContactChangedEvent) => void;
  onCallContactLinked?: (event: CallContactLinkedEvent) => void;
  onTelephonyCallChanged?: (event: TelephonyCallChangedEvent) => void;
}): void {
  const onContactChanged = (event: ContactChangedEvent) => handlers.onContactChanged?.(event);
  const onCallContactLinked = (event: CallContactLinkedEvent) => handlers.onCallContactLinked?.(event);
  const onTelephonyCallChanged = (event: TelephonyCallChangedEvent) => handlers.onTelephonyCallChanged?.(event);

  onMounted(() => {
    const current = ensureSocket();
    current.on('contact:changed', onContactChanged);
    current.on('telephony:contact-linked', onCallContactLinked);
    current.on('telephony:call-changed', onTelephonyCallChanged);
  });

  onUnmounted(() => {
    if (!socket) return;
    socket.off('contact:changed', onContactChanged);
    socket.off('telephony:contact-linked', onCallContactLinked);
    socket.off('telephony:call-changed', onTelephonyCallChanged);
  });
}
