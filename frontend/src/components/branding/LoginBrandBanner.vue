<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!-- Banner thương hiệu cột trái của trang đăng nhập. Dùng chung cho /login và
       preview trong Cài đặt › Hồ sơ tổ chức (DRY — 1 nguồn giao diện duy nhất). -->
  <aside class="login-brand">
    <div class="brand-glow"></div>
    <div class="brand-inner">
      <div class="brand-wordmark">
        <img
          :src="logo"
          :alt="name"
          :class="{ 'brand-logo--compact': logoIsCompact }"
          @load="onLogoLoad"
          @error="onLogoError"
        />
      </div>
      <div class="brand-divider"></div>
      <p v-if="slogan" class="brand-slogan">{{ slogan }}</p>
    </div>
    <div v-if="copyright" class="brand-foot">{{ copyright }}</div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  logoUrl?: string | null;
  name: string;
  slogan?: string | null;
  copyright?: string | null;
}>();

const DEFAULT_LOGO = '/brand/phuc-thinh-solar-wordmark.png';
const logo = ref(props.logoUrl || DEFAULT_LOGO);
const logoIsCompact = ref(false);

// Logo ngang mặc định cần thấp; logo dọc/khối từ kho ảnh cần cao hơn để không bị
// thu nhỏ thành một huy hiệu. Phân loại theo kích thước thật của ảnh sau khi load.
function onLogoLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  logoIsCompact.value = image.naturalHeight / Math.max(image.naturalWidth, 1) > 0.7;
}

// Logo cấu hình hỏng (404/URL sai) → fallback ảnh mặc định.
function onLogoError() {
  logoIsCompact.value = false;
  if (logo.value !== DEFAULT_LOGO) logo.value = DEFAULT_LOGO;
}

// Đồng bộ khi prop đổi (preview cập nhật realtime theo form).
watch(
  () => props.logoUrl,
  (v) => {
    logoIsCompact.value = false;
    logo.value = v || DEFAULT_LOGO;
  },
);
</script>

<style scoped>
.login-brand {
  position: relative;
  flex: 0 0 42%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px 32px;
  background: linear-gradient(160deg, var(--nav-navy, #0a2251) 0%, var(--nav-navy-deep, #061537) 100%);
  color: #fff;
  overflow: hidden;
  text-align: center;
}
.brand-glow {
  position: absolute;
  top: -80px; right: -80px;
  width: 280px; height: 280px;
  background: radial-gradient(circle, rgba(201, 150, 46, 0.22) 0%, transparent 70%);
  pointer-events: none;
}
.brand-inner { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
.brand-wordmark {
  width: min(100%, 300px);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 22px;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.2));
}
.brand-wordmark img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 70px;
  object-fit: contain;
}
.brand-wordmark img.brand-logo--compact {
  width: min(100%, 220px);
  max-height: 170px;
}
.brand-divider {
  width: 44px; height: 3px; border-radius: 2px;
  background: linear-gradient(90deg, var(--nav-gold-dark, #9c7420), var(--nav-gold-light, #e0b654));
  margin: 22px 0 16px;
}
.brand-slogan {
  font-size: 17px; font-weight: 600; letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.86);
  margin: 0;
}
.brand-foot {
  position: relative; z-index: 1;
  margin-top: auto; padding-top: 28px;
  font-size: 11px; color: rgba(255, 255, 255, 0.45);
}

/* ≤900px: banner gọn lại (login xếp dọc) */
@media (max-width: 900px) {
  .login-brand { flex: none; padding: 28px 24px; }
  .brand-wordmark { width: min(100%, 250px); margin-bottom: 14px; }
  .brand-wordmark img { max-height: 54px; }
  .brand-wordmark img.brand-logo--compact { width: min(100%, 180px); max-height: 130px; }
  .brand-divider { margin: 14px 0 10px; }
  .brand-slogan { font-size: 15px; }
  .brand-foot { display: none; }
}
</style>
