<template>
  <div v-if="enabled" class="phone-shell">
    <button
      class="phone-trigger"
      :class="{ live: isBusy, offline: phase === 'error' || phase === 'connecting' }"
      title="Tổng đài nội bộ"
      data-testid="softphone-trigger"
      @click="dialog = true"
    >
      <v-icon :icon="isBusy ? 'mdi-phone-in-talk' : 'mdi-phone-outline'" size="18" />
      <span v-if="isBusy" class="live-dot" />
    </button>

    <v-dialog v-model="dialog" width="440" persistent>
      <section class="softphone" data-testid="softphone-dialog">
        <header class="phone-head">
          <div>
            <span class="eyebrow">OMICALL</span>
            <h2>Tổng đài nội bộ</h2>
          </div>
          <button class="close-btn" :disabled="isBusy" @click="closeDialog"><v-icon icon="mdi-close" /></button>
        </header>

        <audio id="omicall-remote-audio" autoplay />

        <div v-if="phase === 'connecting'" class="state-card muted-state">
          <v-progress-circular indeterminate size="24" width="2" />
          <div><strong>Đang kết nối tổng đài</strong><small>Thiết lập kênh gọi bảo mật…</small></div>
        </div>

        <div v-else-if="phase === 'error'" class="state-card error-state">
          <v-icon icon="mdi-alert-circle-outline" size="28" />
          <div><strong>Chưa kết nối được</strong><small>{{ errorMessage }}</small></div>
          <button class="retry-btn" @click="initialize(true)">Kết nối lại</button>
        </div>

        <div v-else-if="isBusy || phase === 'ended'" class="active-call">
          <div class="avatar-ring" :class="{ pulse: phase === 'ringing' || phase === 'calling' }">
            <v-icon v-if="activePeer?.kind === 'external'" icon="mdi-phone" size="34" />
            <span v-else>{{ initials(activePeer?.fullName || '?') }}</span>
          </div>
          <h3>{{ activePeer?.kind === 'external' ? displayPhone(activePeer.phoneNumber || activePeer.fullName) : (activePeer?.fullName || 'Nhân viên') }}</h3>
          <p class="call-status" data-testid="call-status">{{ statusLabel }}</p>
          <p v-if="phase === 'ended' && errorMessage" class="call-error" data-testid="call-error">{{ errorMessage }}</p>
          <div v-if="phase === 'answered' || (phase === 'ended' && elapsedSec)" class="timer">{{ timerLabel }}</div>

          <div v-if="incoming && phase === 'ringing'" class="call-actions">
            <button class="round reject" data-testid="reject-call" @click="reject"><v-icon icon="mdi-phone-hangup" /></button>
            <button class="round answer" data-testid="answer-call" @click="answer"><v-icon icon="mdi-phone" /></button>
          </div>
          <div v-else-if="phase !== 'ended'" class="call-actions">
            <button class="round secondary" :class="{ selected: muted }" title="Tắt tiếng" @click="toggleMute">
              <v-icon :icon="muted ? 'mdi-microphone-off' : 'mdi-microphone'" />
            </button>
            <button class="round reject" data-testid="hangup-call" @click="hangup"><v-icon icon="mdi-phone-hangup" /></button>
          </div>
          <button v-else class="done-btn" @click="resetEnded">Gọi cuộc khác</button>
        </div>

        <template v-else>
          <div v-if="fromNumber" class="dialer">
            <div class="section-title dialer-title"><span>Gọi số điện thoại</span><small>Hiển thị số {{ displayPhone(fromNumber) }}</small></div>
            <form class="dial-form" @submit.prevent="startPhoneCall">
              <v-icon icon="mdi-dialpad" size="20" />
              <input v-model="phoneInput" data-testid="phone-input" inputmode="tel" autocomplete="tel" placeholder="Nhập số, ví dụ 0909 123 456" />
              <button type="submit" data-testid="call-phone" :disabled="!phoneInput.trim()" title="Gọi số điện thoại">
                <v-icon icon="mdi-phone" size="19" />
              </button>
            </form>
            <small v-if="errorMessage" class="dial-error">{{ errorMessage }}</small>
          </div>

          <div class="section-title"><span>Nhân viên</span><small>{{ peers.length }} người khả dụng</small></div>
          <div v-if="!peers.length" class="empty-state">
            <v-icon icon="mdi-account-multiple-plus-outline" size="34" />
            <strong>Chưa có người để gọi thử</strong>
            <span>Tạo thêm một tài khoản nhân viên CRM rồi đăng nhập ở trình duyệt khác.</span>
          </div>
          <div v-else class="peer-list" data-testid="softphone-peers">
            <button v-for="peer in peers" :key="peer.id" class="peer-row" @click="callPeer(peer)">
              <span class="peer-avatar">{{ initials(peer.fullName) }}</span>
              <span class="peer-copy"><strong>{{ peer.fullName }}</strong><small>{{ roleLabel(peer.role) }}</small></span>
              <span class="call-icon"><v-icon icon="mdi-phone-outline" size="18" /></span>
            </button>
          </div>

          <div v-if="history.length" class="history">
            <div class="section-title">
              <span>Lịch sử cuộc gọi</span>
              <small>{{ history.length }} cuộc gần nhất</small>
            </div>
            <div v-for="item in visibleHistory" :key="item.id" class="history-entry">
              <div class="history-row">
                <v-icon :icon="historyIcon(item)" :class="item.status" size="17" />
                <span class="history-copy"><strong>{{ historyName(item) }}</strong><small>{{ historyLabel(item) }}</small></span>
                <button
                  v-if="recordingUrl(item)"
                  class="recording-btn"
                  :title="playingRecordingId === item.id ? 'Đóng bản ghi âm' : 'Nghe lại ghi âm'"
                  @click="toggleRecording(item.id)"
                >
                  <v-icon :icon="playingRecordingId === item.id ? 'mdi-stop-circle-outline' : 'mdi-play-circle-outline'" size="19" />
                </button>
                <time>{{ formatTime(item.startedAt) }}</time>
              </div>
              <div v-if="playingRecordingId === item.id && recordingUrl(item)" class="recording-player">
                <audio controls preload="metadata" :src="recordingUrl(item)!" />
                <a :href="recordingUrl(item)!" target="_blank" rel="noopener noreferrer" title="Mở hoặc tải file ghi âm">
                  <v-icon icon="mdi-download-outline" size="18" />
                </a>
              </div>
            </div>
            <button v-if="history.length > 5" class="history-toggle" @click="historyExpanded = !historyExpanded">
              {{ historyExpanded ? 'Thu gọn' : `Xem tất cả ${history.length} cuộc` }}
            </button>
          </div>
        </template>
      </section>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useOmicallSoftphone, type CallHistoryItem } from '@/composables/use-omicall-softphone';

const dialog = ref(false);
const phoneInput = ref('');
const historyExpanded = ref(false);
const playingRecordingId = ref<string | null>(null);
const {
  phase, errorMessage, peers, history, activePeer, incoming, muted, elapsedSec, enabled, isBusy,
  fromNumber, initialize, callPeer, callPhone, answer, reject, hangup, toggleMute, resetEnded,
} = useOmicallSoftphone();

onMounted(() => void initialize());
watch(incoming, (value) => { if (value) dialog.value = true; });

const statusLabel = computed(() => ({
  calling: 'Đang gọi…', ringing: incoming.value ? 'Cuộc gọi đến' : 'Đang đổ chuông…',
  answered: 'Đang trò chuyện', ended: 'Cuộc gọi đã kết thúc',
} as Record<string, string>)[phase.value] || 'Sẵn sàng');
const timerLabel = computed(() => `${String(Math.floor(elapsedSec.value / 60)).padStart(2, '0')}:${String(elapsedSec.value % 60).padStart(2, '0')}`);
const visibleHistory = computed(() => historyExpanded.value ? history.value : history.value.slice(0, 5));

function closeDialog() { dialog.value = false; resetEnded(); }
function startPhoneCall() { if (phoneInput.value.trim()) void callPhone(phoneInput.value); }
function initials(name: string) { return name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase(); }
function displayPhone(value: string) {
  if (/^84\d{9,10}$/.test(value)) return `0${value.slice(2)}`;
  return value;
}
function recordingUrl(item: CallHistoryItem) {
  const url = item.recordingId?.trim();
  return url && /^https:\/\//i.test(url) ? url : null;
}
function toggleRecording(id: string) {
  playingRecordingId.value = playingRecordingId.value === id ? null : id;
}
function roleLabel(role: string) { return ({ owner: 'Chủ sở hữu', admin: 'Quản trị viên', member: 'Nhân viên' } as Record<string, string>)[role] || role; }
function formatTime(value: string) { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value)); }
function historyName(item: CallHistoryItem) {
  return item.peerUser?.fullName || item.contact?.crmName || item.contact?.fullName || displayPhone(item.externalNumber || 'Không rõ số');
}
function historyIcon(item: CallHistoryItem) {
  if (['missed', 'failed', 'rejected'].includes(item.status)) return 'mdi-phone-missed-outline';
  return item.direction === 'inbound' ? 'mdi-phone-incoming-outline' : 'mdi-phone-outgoing-outline';
}
function historyLabel(item: CallHistoryItem) {
  const direction = item.direction === 'inbound' ? 'Cuộc gọi đến' : 'Cuộc gọi đi';
  const duration = item.durationSec ? ` · ${Math.floor(item.durationSec / 60)}:${String(item.durationSec % 60).padStart(2, '0')}` : '';
  const failed = ['missed', 'failed', 'rejected'].includes(item.status) ? ' · Không kết nối' : '';
  return `${direction}${duration}${failed}`;
}
</script>

<style scoped>
.phone-shell { flex: 0 0 auto; }
.phone-trigger { position: relative; width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 9px; background: rgba(255,255,255,.1); color: #fff; cursor: pointer; }
.phone-trigger:hover, .phone-trigger.live { background: #16a085; }
.phone-trigger.offline { opacity: .65; }
.live-dot { position: absolute; right: 3px; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: #86efac; box-shadow: 0 0 0 2px #12645d; }
.softphone { overflow: hidden; border-radius: 18px; background: #fff; color: #17212b; box-shadow: 0 24px 80px rgba(12,35,45,.24); }
.phone-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 24px 18px; border-bottom: 1px solid #edf1f2; }
.eyebrow { font-size: 10px; font-weight: 800; letter-spacing: .15em; color: #15947f; }
.phone-head h2 { margin: 3px 0 0; font-size: 21px; letter-spacing: -.02em; }
.close-btn { width: 34px; height: 34px; border: 0; border-radius: 9px; background: #f3f6f6; color: #65727a; cursor: pointer; }
.close-btn:disabled { opacity: .35; cursor: not-allowed; }
.state-card { margin: 22px 24px; min-height: 76px; padding: 16px; display: flex; align-items: center; gap: 13px; border-radius: 13px; background: #f3f8f7; color: #287869; }
.state-card div { display: grid; gap: 3px; flex: 1; }
.state-card small, .empty-state span { color: #718087; }
.error-state { color: #b94b4b; background: #fff5f4; }
.retry-btn, .done-btn { border: 0; border-radius: 9px; padding: 9px 13px; background: #147d70; color: #fff; font-weight: 700; cursor: pointer; }
.active-call { min-height: 370px; padding: 34px 24px 28px; display: flex; flex-direction: column; align-items: center; background: linear-gradient(180deg,#f3faf8 0,#fff 65%); }
.avatar-ring { width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center; background: #d7f0ea; box-shadow: 0 0 0 8px rgba(22,160,133,.08); color: #126e61; font-size: 26px; font-weight: 800; }
.avatar-ring.pulse { animation: phone-pulse 1.6s ease-out infinite; }
@keyframes phone-pulse { 0% { box-shadow: 0 0 0 7px rgba(22,160,133,.13) } 70% { box-shadow: 0 0 0 22px rgba(22,160,133,0) } 100% { box-shadow: 0 0 0 7px rgba(22,160,133,0) } }
.active-call h3 { margin: 22px 0 4px; font-size: 22px; }
.call-status { margin: 0; color: #617078; }
.call-error { max-width: 330px; margin: 10px 0 0; color: #bd4049; font-size: 13px; line-height: 1.45; text-align: center; }
.timer { margin-top: 8px; font-variant-numeric: tabular-nums; color: #263b43; font-weight: 700; }
.call-actions { display: flex; gap: 34px; margin-top: 38px; }
.round { width: 58px; height: 58px; border: 0; border-radius: 50%; display: grid; place-items: center; color: #fff; cursor: pointer; box-shadow: 0 8px 20px rgba(20,50,60,.15); }
.round.answer { background: #18a66f; }.round.reject { background: #e34d59; }.round.secondary { color: #4a5c63; background: #edf2f2; }.round.selected { background: #ccd7d7; }
.done-btn { margin-top: 30px; }
.section-title { padding: 18px 24px 9px; display: flex; justify-content: space-between; align-items: center; }
.section-title span { font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #3f5158; }.section-title small { color: #829097; }
.peer-list { max-height: 245px; overflow: auto; padding: 0 12px 12px; }
.peer-row { width: 100%; padding: 11px 12px; display: flex; align-items: center; gap: 12px; border: 0; border-radius: 11px; background: transparent; text-align: left; cursor: pointer; }
.peer-row:hover { background: #f1f8f6; }
.peer-avatar { width: 38px; height: 38px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; background: #dcefea; color: #147b6c; font-size: 12px; font-weight: 800; }
.peer-copy, .history-copy { display: grid; flex: 1; gap: 2px; }.peer-copy small, .history-copy small { color: #829097; }.call-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: #e7f5f1; color: #148774; }
.empty-state { margin: 8px 24px 24px; padding: 30px 24px; display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center; border: 1px dashed #ccd8d7; border-radius: 13px; color: #65777d; }
.dialer { padding-bottom: 8px; border-bottom: 1px solid #edf1f2; background: #f8fbfa; }
.dialer-title { padding-top: 16px; }
.dial-form { margin: 0 24px; height: 48px; padding: 0 7px 0 14px; display: flex; align-items: center; gap: 10px; border: 1px solid #cddbd8; border-radius: 12px; background: #fff; color: #60716f; }
.dial-form:focus-within { border-color: #15947f; box-shadow: 0 0 0 3px rgba(21,148,127,.1); }
.dial-form input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #17212b; font-size: 15px; }
.dial-form button { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 50%; background: #15947f; color: #fff; cursor: pointer; }
.dial-form button:disabled { opacity: .4; cursor: not-allowed; }
.dial-error { display: block; margin: 7px 24px 0; color: #c24850; }
.history { max-height: 360px; overflow-y: auto; border-top: 1px solid #edf1f2; padding-bottom: 14px; }
.history-entry { border-bottom: 1px solid #f1f4f4; }
.history-row { display: flex; align-items: center; gap: 11px; padding: 8px 24px; }
.history-row > .v-icon { color: #168874; }
.history-row > .v-icon.missed, .history-row > .v-icon.failed, .history-row > .v-icon.rejected { color: #d6535d; }
.history-row time { color: #8a969b; font-size: 11px; white-space: nowrap; }
.recording-btn { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; border: 0; border-radius: 50%; background: #e7f5f1; color: #148774; cursor: pointer; }
.recording-btn:hover { background: #d5eee7; }
.recording-player { display: flex; align-items: center; gap: 8px; padding: 0 24px 10px 52px; }
.recording-player audio { min-width: 0; width: 100%; height: 34px; }
.recording-player a { color: #148774; }
.history-toggle { width: calc(100% - 48px); margin: 10px 24px 0; padding: 8px; border: 0; border-radius: 8px; background: #f0f6f5; color: #147d70; font-weight: 700; cursor: pointer; }
</style>
