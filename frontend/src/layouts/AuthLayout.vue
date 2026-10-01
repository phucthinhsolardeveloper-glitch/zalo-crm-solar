<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!-- 2026-06-09 (anh chốt): login 2 cột — banner thương hiệu Phúc Thịnh Solar trái + form phải.
       Bỏ container 450px cũ, để LoginView tự dựng 2 cột full màn. -->
  <v-app class="auth-shell">
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh;">
      <slot />
    </v-main>
  </v-app>
</template>

<style scoped>
/* Nền sáng trung tính để navy/gold ở banner login làm điểm nhận diện chính. */
.auth-shell {
  background:
    radial-gradient(circle at 15% 10%, rgba(201, 150, 46, .08), transparent 34%),
    #f7f9fc;
}
</style>
