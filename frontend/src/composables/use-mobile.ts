// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';

// Đồng bộ với breakpoint `md` của Vuetify. Trước đây raw resize <768 làm layout
// desktop/mobile remount chập chờn quanh mép DevTools và tablet 768px vẫn nhận UI desktop.
const MOBILE_MEDIA_QUERY = '(max-width: 959px)';

const isMobile = ref(false);
const isOnline = ref(true);

let initialized = false;
let mobileMedia: MediaQueryList | null = null;

function updateMobile(event?: MediaQueryListEvent) {
  isMobile.value = event?.matches ?? mobileMedia?.matches ?? false;
}

function updateOnline() {
  isOnline.value = navigator.onLine;
}

export function useMobile() {
  if (!initialized) {
    initialized = true;
    if (typeof window !== 'undefined') {
      updateMobile();
      updateOnline();
      mobileMedia = window.matchMedia(MOBILE_MEDIA_QUERY);
      updateMobile();
      mobileMedia.addEventListener('change', updateMobile);
      window.addEventListener('online', updateOnline);
      window.addEventListener('offline', updateOnline);
    }
  }

  return { isMobile, isOnline };
}
