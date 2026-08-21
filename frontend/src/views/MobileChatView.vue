<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="mobile-chat" style="height: calc(100vh - 120px);">
    <!-- Conversation list (shown when no conversation selected) -->
    <div v-if="!selectedConvId" style="height: 100%;">
      <ConversationList
        :conversations="conversations"
        :selected-id="selectedConvId"
        :loading="loadingConvs"
        v-model:search="searchQuery"
        @select="selectConversation"
        @filter-account="onFilterAccount"
      />
    </div>

    <!-- Message thread (shown when conversation selected) -->
    <div v-else style="height: 100%; display: flex; flex-direction: column;">
      <!-- Back button bar -->
      <!-- FIX 2026-08-21 (anh báo: gọi điện biến mất trên mobile) — MessageThread mobile
           tắt hẳn contact-panel (show-contact-panel=false) nên không còn chỗ nào gọi được
           từ trong khung chat. Gắn CallButton thẳng vào thanh header này. -->
      <div class="d-flex align-center pa-2" style="flex-shrink: 0; gap: 4px;">
        <v-btn icon variant="text" size="small" @click="goBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <span v-if="selectedConv" class="text-body-2 font-weight-medium ml-1" style="flex: 1; min-width: 0;">
          {{ selectedConv.contact?.fullName || 'Chat' }}
        </span>
        <CallButton
          v-if="selectedConv?.contact?.phone"
          :phone="selectedConv.contact.phone"
          :contact-id="selectedConv.contact.id"
          :full-name="selectedConv.contact.fullName"
          :avatar-url="selectedConv.contact.avatarUrl"
          size="small"
        />
      </div>

      <MessageThread
        :conversation="selectedConv"
        :messages="allMessages"
        :loading="loadingMsgs"
        :sending="sendingMsg"
        :show-contact-panel="false"
        :ai-suggestion="(null as any)"
        :ai-suggestion-loading="false"
        :ai-suggestion-error="(null as any)"
        @send="handleSend"
        @refresh-thread="selectedConvId && fetchMessages(selectedConvId)"
        style="flex: 1; min-height: 0;"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed } from 'vue';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import CallButton from '@/components/telephony/CallButton.vue';
import { useChat } from '@/composables/use-chat';
import { useOfflineQueue } from '@/composables/use-offline-queue';

const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter,
  fetchConversations, fetchMessages, selectConversation, sendMessage, sendMessageTo,
  initSocket, destroySocket,
} = useChat();

const { pendingMessages, enqueue, flush } = useOfflineQueue();

function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  fetchConversations();
}

function goBack() {
  selectedConvId.value = null;
}

// Merge real messages with pending offline messages
const allMessages = computed(() => {
  const pending = pendingMessages.value
    .filter(p => p.conversationId === selectedConvId.value)
    .map(p => ({
      id: p.id,
      content: p.content,
      contentType: 'text',
      senderType: 'self',
      senderName: null,
      sentAt: p.createdAt,
      isDeleted: false,
      zaloMsgId: null,
      albumKey: null,
      albumIndex: null,
      albumTotal: null,
      _pending: true,
    }));
  return [...messages.value, ...pending];
});

async function handleSend(
  content: string,
  replyMessageId?: string | null,
  styles?: Array<{ st: string; start: number; len: number }>,
  mentions?: Array<{ uid: string; pos: number; len: number }>,
) {
  if (!selectedConvId.value) return;
  if (!navigator.onLine) {
    enqueue(selectedConvId.value, content);
    return;
  }
  await sendMessage(content, replyMessageId, styles, mentions);
}

// Flush queue when coming back online
function onOnline() {
  flush(sendMessageTo);
}

onMounted(() => {
  fetchConversations();
  initSocket();
  window.addEventListener('online', onOnline);
});

onUnmounted(() => {
  destroySocket();
  window.removeEventListener('online', onOnline);
  clearTimeout(searchTimeout);
});

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});
</script>
