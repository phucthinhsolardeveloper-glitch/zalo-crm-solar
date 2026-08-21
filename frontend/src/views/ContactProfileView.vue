<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Route adapter cho /contacts/:id/profile.

  Hồ sơ thật được render bằng CustomerProfileDialog — component dùng chung đã tự
  fetch GET /contacts/:id và hỗ trợ Tổng quan/Nick chăm/Lịch sử/Ghi chú. Giữ adapter
  này để các link từ Chat có URL riêng nhưng không tạo thêm một bản UI hồ sơ thứ ba.
-->
<template>
  <main class="profile-route" aria-label="Hồ sơ khách hàng">
    <div class="profile-route-card">
      <span>Đang mở hồ sơ khách hàng…</span>
      <button type="button" @click="leaveProfile">← Quay lại</button>
    </div>

    <CustomerProfileDialog
      :key="contactId"
      v-model="profileOpen"
      :contact-id="contactId"
      mode="view"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CustomerProfileDialog from '@/components/contacts/CustomerProfileDialog.vue';

const route = useRoute();
const router = useRouter();
const profileOpen = ref(true);
const contactId = computed(() => String(route.params.id || ''));

watch(profileOpen, (open) => {
  if (!open) leaveProfile();
});

function leaveProfile() {
  if (window.history.length > 1) router.back();
  else void router.replace('/contacts');
}
</script>

<style scoped>
.profile-route {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #f7f8fa;
}
.profile-route-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #667085;
  font-size: 13px;
}
.profile-route-card button {
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  color: #344054;
  padding: 8px 14px;
  cursor: pointer;
  font: inherit;
}
.profile-route-card button:hover {
  background: #f2f4f7;
}
</style>
