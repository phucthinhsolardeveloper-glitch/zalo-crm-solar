<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="mobile-contacts pa-3">
    <div class="mobile-contact-head">
      <div><strong>Khách hàng</strong><small>{{ total }} hồ sơ</small></div>
      <v-btn size="small" color="primary" prepend-icon="mdi-account-plus-outline" @click="openCreate">Thêm KH</v-btn>
    </div>
    <!-- Search bar -->
    <v-text-field
      v-model="filters.search"
      placeholder="Tìm khách hàng..."
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="compact"
      hide-details
      clearable
      rounded="xl"
      class="mb-3"
      @update:model-value="onSearch"
    />

    <!-- Filter chips -->
    <!-- FIX 2026-08-21 (anh báo: chip dính vào nhau) — v-chip mặc định flex-shrink:1, trong
         hàng flex overflow-x-auto không đặt flex-shrink:0 thì trình duyệt ép các chip NHỎ
         HƠN chữ bên trong (thay vì cho hàng tràn ra rồi cuộn) → chữ mỗi chip tràn ra ngoài
         khung bo tròn, đè lên chip kế bên, nhìn như dính làm một. flex-shrink:0 buộc mỗi
         chip giữ đúng kích thước theo chữ, hàng tự tràn ngang và cuộn được thay vì bóp méo. -->
    <div class="d-flex gap-2 mb-3 overflow-x-auto" style="flex-wrap: nowrap;">
      <v-chip
        v-for="status in STATUS_OPTIONS"
        :key="status.value"
        :color="filters.status === status.value ? statusColor(status.value) : undefined"
        :variant="filters.status === status.value ? 'flat' : 'outlined'"
        size="small"
        style="flex-shrink: 0;"
        @click="toggleStatus(status.value)"
      >
        {{ status.text }}
      </v-chip>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- Contact cards -->
    <div v-else class="d-flex flex-column gap-2">
      <v-card
        v-for="contact in contacts"
        :key="contact.id"
        variant="tonal"
        rounded="xl"
        class="pa-3"
        @click="openContact(contact)"
      >
        <div class="d-flex align-center">
          <v-avatar size="40" color="grey-lighten-2" class="mr-3">
            <v-img v-if="contact.avatarUrl" :src="contact.avatarUrl" />
            <v-icon v-else size="20">mdi-account</v-icon>
          </v-avatar>
          <div style="flex: 1; min-width: 0;">
            <div class="text-body-2 font-weight-medium text-truncate">{{ contact.fullName }}</div>
            <div class="text-caption text-medium-emphasis">{{ contact.phone || 'Chưa có SĐT' }}</div>
          </div>
          <CallButton
            v-if="contact.phone"
            :phone="contact.phone"
            :contact-id="contact.id"
            :full-name="contact.fullName"
            :avatar-url="contact.avatarUrl"
            size="small"
          />
          <div class="mobile-contact-meta">
            <v-chip v-if="contact.displayStatus || contact.status" :color="contact.displayStatus?.color || statusColor(contact.status || '')" size="x-small" variant="tonal">
              {{ contact.displayStatus?.name || statusLabel(contact.status || '') }}
            </v-chip>
            <small v-if="contact.customerType">{{ customerTypeLabel(contact.customerType) }}</small>
          </div>
        </div>
      </v-card>

      <div v-if="contacts.length === 0" class="text-center py-8 text-medium-emphasis">
        Không tìm thấy khách hàng
      </div>
    </div>

    <!-- Detail dialog -->
    <ContactDetailDialog
      v-model="showDialog"
      :contact="selectedContact"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import ContactDetailDialog from '@/components/contacts/ContactDetailDialog.vue';
import CallButton from '@/components/telephony/CallButton.vue';
import { useContacts, STATUS_OPTIONS, CUSTOMER_TYPE_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';
import { useCrmLinkSocket } from '@/composables/use-crm-link-socket';

const { contacts, total, loading, filters, fetchContacts } = useContacts();

const showDialog = ref(false);
const selectedContact = ref<Contact | null>(null);

let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
useCrmLinkSocket({
  onContactChanged: () => {
    if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(() => void fetchContacts(), 120);
  },
});

function statusColor(status: string) {
  const map: Record<string, string> = {
    new: 'grey', contacted: 'blue', interested: 'orange',
    converted: 'success', lost: 'error',
  };
  return map[status] ?? 'grey';
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(o => o.value === value)?.text ?? value;
}
function customerTypeLabel(value: string) {
  return CUSTOMER_TYPE_OPTIONS.find(o => o.value === value)?.text ?? value;
}

function toggleStatus(value: string) {
  filters.status = filters.status === value ? '' : value;
  fetchContacts();
}

let searchTimeout: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchContacts(), 300);
}

function openContact(contact: Contact) {
  selectedContact.value = contact;
  showDialog.value = true;
}

function openCreate() {
  selectedContact.value = null;
  showDialog.value = true;
}

function onSaved() { fetchContacts(); }
function onDeleted() { fetchContacts(); }

onMounted(() => fetchContacts());
onUnmounted(() => {
  clearTimeout(searchTimeout);
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
});
</script>

<style scoped>
.mobile-contacts { width: 100%; min-width: 0; overflow-x: hidden; }
.mobile-contact-head { margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mobile-contact-head > div { display: grid; gap: 1px; }
.mobile-contact-head strong { font-size: 19px; }
.mobile-contact-head small { color: rgba(var(--v-theme-on-surface), .58); font-size: 11px; }
.mobile-contact-meta { max-width: 118px; display: grid; justify-items: end; gap: 3px; }
.mobile-contact-meta small { color: rgba(var(--v-theme-on-surface), .62); font-size: 10px; white-space: nowrap; }
@media (max-width: 390px) {
  .mobile-contacts { padding-inline: 8px !important; }
  .mobile-contact-head .v-btn { min-width: 0; padding-inline: 10px; }
}
</style>
