<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  ProvinceWardPicker — chọn Tỉnh/Thành phố + Phường/Xã theo danh sách CHÍNH
  THỨC (address-kit, mô hình 2 cấp sau sáp nhập). Thay AddressAutocomplete cho
  riêng use-case địa chỉ Contact (mục E 2026-09-30) — AddressAutocomplete vẫn
  giữ nguyên cho các chỗ dùng khác (gợi ý tự do, không cần chuẩn theo mã).
  Emit cả code lẫn name để form cha ghi thẳng vào field 2 cấp mới.
-->
<template>
  <div class="pwp">
    <div class="pwp-field">
      <select
        class="pwp-select"
        :value="provinceCode ?? ''"
        :disabled="loadingProvinces"
        @change="onProvinceChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>{{ loadingProvinces ? 'Đang tải...' : 'Chọn tỉnh/thành phố' }}</option>
        <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
      </select>
    </div>
    <div class="pwp-field">
      <select
        class="pwp-select"
        :value="wardCode ?? ''"
        :disabled="!provinceCode || loadingWards"
        @change="onWardChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ !provinceCode ? 'Chọn tỉnh trước' : (loadingWards ? 'Đang tải...' : '— Không chọn phường/xã —') }}</option>
        <option v-for="w in wards" :key="w.code" :value="w.code">{{ w.name }}</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { fetchProvinces, fetchWards, type AddressUnit } from '@/composables/use-address-kit';

const props = defineProps<{
  provinceCode: string | null;
  provinceName?: string | null;
  wardCode: string | null;
  wardName?: string | null;
}>();

const emit = defineEmits<{
  'update:province': [{ code: string | null; name: string | null }];
  'update:ward': [{ code: string | null; name: string | null }];
}>();

const provinces = ref<AddressUnit[]>([]);
const wards = ref<AddressUnit[]>([]);
const loadingProvinces = ref(false);
const loadingWards = ref(false);

onMounted(async () => {
  loadingProvinces.value = true;
  try {
    provinces.value = await fetchProvinces();
  } finally {
    loadingProvinces.value = false;
  }
  if (props.provinceCode) await loadWards(props.provinceCode);
});

async function loadWards(provinceCode: string) {
  loadingWards.value = true;
  wards.value = [];
  try {
    wards.value = await fetchWards(provinceCode);
  } finally {
    loadingWards.value = false;
  }
}

function onProvinceChange(code: string) {
  const p = provinces.value.find((x) => x.code === code) ?? null;
  emit('update:province', { code: p?.code ?? null, name: p?.name ?? null });
  // Đổi tỉnh → xã cũ không còn hợp lệ, xoá lựa chọn xã.
  emit('update:ward', { code: null, name: null });
  wards.value = [];
  if (p) void loadWards(p.code);
}

function onWardChange(code: string) {
  if (!code) { emit('update:ward', { code: null, name: null }); return; }
  const w = wards.value.find((x) => x.code === code) ?? null;
  emit('update:ward', { code: w?.code ?? null, name: w?.name ?? null });
}

// Nếu parent set provinceCode từ ngoài (vd load contact có sẵn) sau khi mount.
watch(() => props.provinceCode, (code, oldCode) => {
  if (code && code !== oldCode && wards.value.length === 0) void loadWards(code);
});
</script>

<style scoped>
.pwp { display: flex; gap: 8px; flex-wrap: wrap; }
.pwp-field { flex: 1; min-width: 160px; }
.pwp-select {
  width: 100%; padding: 8px 10px; border: 1px solid var(--line, #e7eaf0);
  border-radius: 8px; font-size: 13px; background: var(--surface, #fff);
  color: var(--ink, #141a24);
}
.pwp-select:disabled { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
</style>
