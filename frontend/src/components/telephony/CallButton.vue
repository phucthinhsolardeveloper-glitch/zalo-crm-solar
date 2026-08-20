<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  CallButton.vue — nút gọi tái dùng cho MỌI nơi hiển thị số điện thoại (call-history,
  hồ sơ khách hàng, danh sách KH, ...). Bọc useOmicallSoftphone().callPhone() với UI/lỗi
  nhất quán — thay vì mỗi màn hình tự viết logic gọi + xử lý lỗi riêng.
-->
<template>
  <button
    class="call-btn"
    :class="[size, { icon: !label }]"
    :disabled="!canCall || busy || calling"
    :title="!canCall ? unavailableTitle : (busy ? 'Bạn đang có một cuộc gọi khác' : `Gọi ${displayLabel}`)"
    @click.stop="onClick"
  >
    <v-icon :icon="calling ? 'mdi-phone-ring-outline' : 'mdi-phone-outline'" :size="iconSize" />
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOmicallSoftphone, type PhonePeer } from '@/composables/use-omicall-softphone';
import { useToast } from '@/composables/use-toast';

const props = withDefaults(defineProps<{
  phone?: string | null;
  contactId?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  size?: 'small' | 'default';
  label?: string;
  // Gọi nội bộ (đồng nghiệp không có SĐT ngoài, vd cuộc gọi extension-tới-extension trong
  // Lịch sử cuộc gọi) — truyền peer thay vì phone. Có peer thì ưu tiên gọi peer.
  peer?: PhonePeer | null;
}>(), {
  size: 'default',
});

const { callPhone, callPeer, isBusy } = useOmicallSoftphone();
const toast = useToast();
const calling = ref(false);
const busy = computed(() => isBusy.value);
const iconSize = computed(() => (props.size === 'small' ? 15 : 17));
const canCall = computed(() => Boolean(props.peer?.omicallExtension || props.phone));

const displayPhone = computed(() => {
  const value = props.phone || '';
  return /^84\d{9,10}$/.test(value) ? `0${value.slice(2)}` : value;
});
const displayLabel = computed(() => props.peer?.fullName || displayPhone.value);
const unavailableTitle = computed(() => (
  props.peer !== undefined && !props.peer?.omicallExtension
    ? 'Người này chưa có extension để gọi'
    : 'Chưa có số điện thoại'
));

async function onClick() {
  if (!canCall.value || busy.value || calling.value) return;
  calling.value = true;
  try {
    if (props.peer?.omicallExtension) {
      await callPeer(props.peer);
    } else if (props.phone) {
      await callPhone(props.phone, {
        contactId: props.contactId || undefined,
        fullName: props.fullName || undefined,
        avatarUrl: props.avatarUrl,
      });
    }
  } catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || 'Không thể gọi');
  } finally {
    calling.value = false;
  }
}
</script>

<style scoped>
.call-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #b8dcd4;
  border-radius: 8px;
  padding: 6px 10px;
  background: #f1faf8;
  color: #147d70;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
.call-btn:disabled { opacity: .45; cursor: not-allowed; }
.call-btn.icon { padding: 6px; border-radius: 50%; }
.call-btn.small { padding: 4px; }
.call-btn.small.icon { padding: 4px; }
</style>
